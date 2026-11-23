import { describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { rentTimeForDay } from "@/lib/booking/escrow";
import { createEscrowChain } from "./chain";
import { escrowsOpen, holdOf, stayAmount, verifyFunding } from "./escrow-proof";
import { FakeRpc, STAY } from "./test-fixtures";

const guest = Keypair.generate();
const wallet = guest.publicKey.toBase58();

const check = (rpc: FakeRpc, signature: string, who = wallet, stay = STAY) =>
  verifyFunding(createEscrowChain(rpc), signature, who, stay, {
    sleep: async () => {},
  });

describe("payment proof for confirming a booking", () => {
  test("the guest's real escrow payment for this stay confirms it", async () => {
    const rpc = new FakeRpc();
    const signature = rpc.pay(guest, STAY);
    expect(stayAmount(STAY)).toBe(BigInt(60_000_000)); // 2 nights x 30 USDC
    expect(await check(rpc, signature)).toEqual({ ok: true });
  });

  test("an unknown signature is refused", async () => {
    const rpc = new FakeRpc();
    const fake = "5".repeat(87);
    expect(await check(rpc, fake)).toMatchObject({
      ok: false,
      status: 409,
      error: "This payment is not on the network.",
    });
    expect(rpc.calls.filter((c) => c === "getTransaction")).toHaveLength(3);
  });

  test("a payment our RPC node sees a moment late still confirms", async () => {
    const rpc = new FakeRpc();
    const signature = rpc.pay(guest, STAY);
    rpc.lag = 2;
    expect(await check(rpc, signature)).toEqual({ ok: true });
  });

  test("another guest's real payment cannot confirm this booking", async () => {
    const rpc = new FakeRpc();
    const signature = rpc.pay(Keypair.generate(), STAY);
    expect(await check(rpc, signature)).toMatchObject({
      ok: false,
      error: "This payment was not made by this wallet.",
    });
  });

  test("a payment for other dates, room or price is refused", async () => {
    const rpc = new FakeRpc();
    const cases = [
      rpc.pay(guest, STAY, { rentTime: rentTimeForDay("2026-12-01") }),
      rpc.pay(guest, STAY, { amount: BigInt(30_000_000) }),
      rpc.pay(guest, STAY, { apartmentId: 2 }),
    ];
    for (const signature of cases) {
      expect(await check(rpc, signature)).toMatchObject({
        ok: false,
        error: "This payment did not fund this booking's escrow.",
      });
    }
    // The 2-night payment cannot confirm a 3-night stay either.
    const twoNights = rpc.pay(guest, STAY);
    expect(
      (
        await check(rpc, twoNights, wallet, {
          ...STAY,
          checkOutDate: "2026-12-03",
        })
      ).ok,
    ).toBe(false);
  });

  test("a failed transaction is refused", async () => {
    const rpc = new FakeRpc();
    const signature = rpc.pay(guest, STAY, { failed: true });
    expect(await check(rpc, signature)).toMatchObject({
      ok: false,
      error: "This payment failed on the network.",
    });
  });

  test("an RPC outage is a retryable 503, not a refusal", async () => {
    const rpc = new FakeRpc();
    const signature = rpc.pay(guest, STAY);
    rpc.failing = true;
    expect(await check(rpc, signature)).toMatchObject({
      ok: false,
      status: 503,
    });
  });
});

describe("escrow state for cancelling and releasing", () => {
  const booking = holdOf(wallet, STAY);

  test("no escrow account means closed", async () => {
    const rpc = new FakeRpc();
    expect(await escrowsOpen(createEscrowChain(rpc), [booking])).toEqual([
      false,
    ]);
  });

  test("the guest's escrow for this check-in is open", async () => {
    const rpc = new FakeRpc();
    rpc.pay(guest, STAY);
    expect(await escrowsOpen(createEscrowChain(rpc), [booking])).toEqual([
      true,
    ]);
    rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    expect(await escrowsOpen(createEscrowChain(rpc), [booking])).toEqual([
      false,
    ]);
  });

  test("an escrow for other dates means this booking's escrow is closed", async () => {
    const rpc = new FakeRpc();
    rpc.openEscrow(
      guest.publicKey,
      STAY.apartmentId,
      BigInt(60_000_000),
      rentTimeForDay("2027-01-10"),
    );
    expect(await escrowsOpen(createEscrowChain(rpc), [booking])).toEqual([
      false,
    ]);
  });

  test("checks many bookings in one RPC call", async () => {
    const rpc = new FakeRpc();
    const others = Array.from({ length: 5 }, () => Keypair.generate());
    rpc.pay(others[2], STAY);
    const result = await escrowsOpen(
      createEscrowChain(rpc),
      others.map((k) => holdOf(k.publicKey.toBase58(), STAY)),
    );
    expect(result).toEqual([false, false, true, false, false]);
    expect(rpc.calls).toEqual(["getMultipleAccountsInfo"]);
  });

  test("throws when the chain cannot be read", async () => {
    const rpc = new FakeRpc();
    rpc.failing = true;
    expect(escrowsOpen(createEscrowChain(rpc), [booking])).rejects.toThrow();
  });
});
