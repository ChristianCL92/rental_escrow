import { describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import {
  isWalletAddress,
  lastBookableDay,
  MAX_NIGHTS,
  parseDay,
  validateNewStay,
} from "./limits";
import { escrowAddress } from "@/lib/solana/escrow-account";

const NOW = Date.parse("2026-11-23T12:00:00.000Z");

const stay = (checkInDate: string, checkOutDate: string, apartmentId = 1) =>
  validateNewStay({ apartmentId, checkInDate, checkOutDate }, NOW);

const errorOf = (result: ReturnType<typeof stay>) =>
  result.ok ? null : result.error;

describe("booking limits", () => {
  test("accepts a normal stay", () => {
    const result = stay("2026-12-01", "2026-12-05");
    expect(result.ok).toBe(true);
    expect(result.ok && result.nights).toBe(4);
  });

  test(`accepts exactly ${MAX_NIGHTS} nights and refuses 31`, () => {
    expect(stay("2026-12-01", "2026-12-31").ok).toBe(true);
    expect(errorOf(stay("2026-12-01", "2027-01-01"))).toBe(
      "A stay can be at most 30 nights.",
    );
  });

  test("refuses a whole year (the reported Postman hold)", () => {
    expect(errorOf(stay("2026-12-01", "2027-11-30"))).toBe(
      "A stay can be at most 30 nights.",
    );
  });

  test("refuses stays more than 12 months ahead", () => {
    expect(lastBookableDay(NOW)).toBe("2027-11-23");
    expect(stay("2027-11-20", "2027-11-23").ok).toBe(true);
    expect(errorOf(stay("2027-11-21", "2027-11-24"))).toBe(
      "Stays can be booked at most 12 months ahead.",
    );
    expect(errorOf(stay("2029-01-01", "2029-01-03"))).toBe(
      "Stays can be booked at most 12 months ahead.",
    );
  });

  test("refuses a check-in in the past, accepts today (UTC)", () => {
    expect(errorOf(stay("2026-11-22", "2026-11-25"))).toBe(
      "Check-in can't be in the past.",
    );
    expect(stay("2026-11-23", "2026-11-25").ok).toBe(true);
  });

  test("refuses reversed and same-day dates", () => {
    expect(errorOf(stay("2026-12-05", "2026-12-01"))).toBe(
      "Check-out must be after check-in.",
    );
    expect(errorOf(stay("2026-12-05", "2026-12-05"))).toBe(
      "Check-out must be after check-in.",
    );
  });

  test("refuses days that do not exist or are not yyyy-mm-dd", () => {
    expect(parseDay("2027-02-30")).toBeNull();
    expect(parseDay("2026-12-1")).toBeNull();
    expect(parseDay("2026-12-01T00:00:00Z")).toBeNull();
    expect(parseDay(20261201)).toBeNull();
    expect(errorOf(stay("2027-02-27", "2027-02-30"))).toBe(
      "Dates must be real days as yyyy-mm-dd.",
    );
  });

  test("refuses rooms that do not exist", () => {
    for (const apartmentId of [0, 6, 1.5, -1]) {
      expect(errorOf(stay("2026-12-01", "2026-12-03", apartmentId))).toBe(
        "This room does not exist.",
      );
    }
    expect(
      validateNewStay(
        {
          apartmentId: "1",
          checkInDate: "2026-12-01",
          checkOutDate: "2026-12-03",
        },
        NOW,
      ).ok,
    ).toBe(false);
  });
});

describe("wallet addresses", () => {
  test("accepts a wallet's public key", () => {
    expect(isWalletAddress(Keypair.generate().publicKey.toBase58())).toBe(true);
  });

  test("refuses garbage, PDAs and non-strings", () => {
    expect(isWalletAddress("TestWallet123")).toBe(false);
    expect(isWalletAddress("0OIl".repeat(11))).toBe(false);
    expect(isWalletAddress(42)).toBe(false);
    // An escrow PDA is a valid address but no wallet can sign for it.
    const pda = escrowAddress(Keypair.generate().publicKey, 1).toBase58();
    expect(isWalletAddress(pda)).toBe(false);
  });
});
