import { describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import {
  consumeSignature,
  SIGNATURE_MAX_AGE_MS,
  verifySignedRequest,
} from "./signed-request";
import { Clock, memoryAuthStore, NOW, signAs, STAY } from "./test-fixtures";

const guest = Keypair.generate();
const other = Keypair.generate();
const fields = { action: "reserve" as const, ...STAY };
const options = { now: NOW, maxAgeMs: SIGNATURE_MAX_AGE_MS };

const verify = (auth: unknown, at = NOW, signed = fields) =>
  verifySignedRequest(auth, signed, { ...options, now: at });

describe("wallet signature verification", () => {
  test("accepts the wallet's signature of exactly this request", () => {
    const result = verify(signAs(guest, "reserve", STAY));
    expect(result).toMatchObject({
      ok: true,
      wallet: guest.publicKey.toBase58(),
    });
  });

  test("refuses an unsigned request", () => {
    for (const auth of [undefined, null, {}, "sig"]) {
      expect(verify(auth)).toEqual({
        ok: false,
        status: 401,
        error: "This request must be signed with your wallet.",
      });
    }
  });

  test("refuses a signature made by another wallet", () => {
    // Signed by `other`, but claiming to be `guest`.
    const auth = signAs(other, "reserve", STAY, {
      wallet: guest.publicKey.toBase58(),
    });
    expect(verify(auth)).toMatchObject({
      ok: false,
      status: 401,
      error: "The signature does not match this request.",
    });
  });

  test("refuses an expired signature and one from the future", () => {
    const auth = signAs(guest, "reserve", STAY);
    expect(verify(auth, NOW + SIGNATURE_MAX_AGE_MS).ok).toBe(true);
    expect(verify(auth, NOW + SIGNATURE_MAX_AGE_MS + 1)).toMatchObject({
      ok: false,
      status: 401,
      error: "Your signature expired. Please sign again.",
    });
    const future = signAs(guest, "reserve", STAY, {
      issuedAt: new Date(NOW + 5 * 60_000).toISOString(),
    });
    expect(verify(future).ok).toBe(false);
  });

  test("refuses a tampered request: other dates, room or action", () => {
    const auth = signAs(guest, "reserve", STAY);
    for (const signed of [
      { ...fields, checkOutDate: "2027-11-30" },
      { ...fields, checkInDate: "2026-11-29" },
      { ...fields, apartmentId: 2 },
      {
        action: "cancel" as const,
        apartmentId: 1,
        checkInDate: STAY.checkInDate,
      },
    ]) {
      expect(verify(auth, NOW, signed as typeof fields)).toMatchObject({
        ok: false,
        error: "The signature does not match this request.",
      });
    }
    expect(verify({ ...auth, nonce: "ffffffffffffffff" }).ok).toBe(false);
    expect(
      verify({ ...auth, issuedAt: new Date(NOW + 1).toISOString() }).ok,
    ).toBe(false);
    const bytes = Buffer.from(auth.signature, "base64");
    bytes[10] ^= 1;
    expect(verify({ ...auth, signature: bytes.toString("base64") }).ok).toBe(
      false,
    );
  });

  test("refuses malformed fields", () => {
    const auth = signAs(guest, "reserve", STAY);
    expect(verify({ ...auth, wallet: "TestWallet123" })).toMatchObject({
      error: "The signing wallet address is not valid.",
    });
    expect(verify({ ...auth, signature: "AAAA" }).ok).toBe(false);
    expect(verify({ ...auth, issuedAt: "2026-11-23" }).ok).toBe(false);
    expect(verify({ ...auth, nonce: "xyz" }).ok).toBe(false);
  });
});

describe("replay protection", () => {
  test("a signature is accepted once", async () => {
    const clock = new Clock();
    const store = memoryAuthStore(clock);
    const result = verify(signAs(guest, "reserve", STAY));
    if (!result.ok) throw new Error("expected a valid signature");

    expect(await consumeSignature(store, result, SIGNATURE_MAX_AGE_MS)).toBe(
      null,
    );
    expect(await consumeSignature(store, result, SIGNATURE_MAX_AGE_MS)).toEqual(
      {
        ok: false,
        status: 401,
        error: "This signature was already used. Please sign again.",
      },
    );
    // Still refused until it has expired anyway.
    clock.advance(SIGNATURE_MAX_AGE_MS);
    expect(
      (await consumeSignature(store, result, SIGNATURE_MAX_AGE_MS))?.status,
    ).toBe(401);
  });

  test("two signatures of the same stay are different requests", async () => {
    const store = memoryAuthStore(new Clock());
    const first = verify(signAs(guest, "reserve", STAY));
    const second = verify(
      signAs(guest, "reserve", STAY, { nonce: "fedcba9876543210fedcba98" }),
    );
    if (!first.ok || !second.ok) throw new Error("expected valid signatures");
    expect(await consumeSignature(store, first, SIGNATURE_MAX_AGE_MS)).toBe(
      null,
    );
    expect(await consumeSignature(store, second, SIGNATURE_MAX_AGE_MS)).toBe(
      null,
    );
  });

  test("refuses, rather than allows, when the store is down", async () => {
    const store = memoryAuthStore(new Clock());
    store.failing = true;
    const result = verify(signAs(guest, "reserve", STAY));
    if (!result.ok) throw new Error("expected a valid signature");
    expect(
      (await consumeSignature(store, result, SIGNATURE_MAX_AGE_MS))?.status,
    ).toBe(503);
  });
});
