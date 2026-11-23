import { describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { HOLD_TTL_MS } from "@/lib/booking/auth-message";
import { isExpiredHold, parseTimestamp, releaseStaleBookings } from "./holds";
import { setup, STAY } from "./test-fixtures";

const guest = Keypair.generate();

const seedHold = (
  env: ReturnType<typeof setup>,
  status: "pending" | "confirmed" = "pending",
) =>
  env.repo.seed({
    apartment_id: STAY.apartmentId,
    check_in_date: STAY.checkInDate,
    check_out_date: STAY.checkOutDate,
    guest_wallet: guest.publicKey.toBase58(),
    status,
  });

const release = async (env: ReturnType<typeof setup>) =>
  releaseStaleBookings(await env.repo.activeForApartment(STAY.apartmentId), {
    repo: env.repo,
    chain: env.chain,
    now: env.clock.now,
  });

describe("unpaid holds expire after 10 minutes", () => {
  test("a hold under 10 minutes old keeps its nights", async () => {
    const env = setup();
    const hold = seedHold(env);
    env.clock.advance(HOLD_TTL_MS - 1);
    expect(isExpiredHold(hold, env.clock.now)).toBe(false);
    expect(await release(env)).toHaveLength(1);
    expect(env.rpc.calls).toEqual([]);
  });

  test("an unpaid hold past 10 minutes is released after checking the chain", async () => {
    const env = setup();
    seedHold(env);
    env.clock.advance(HOLD_TTL_MS);
    expect(await release(env)).toEqual([]);
    expect(env.repo.rows.size).toBe(0);
    expect(env.rpc.calls).toEqual(["getMultipleAccountsInfo"]);
  });

  test("a hold whose payment landed late keeps its nights", async () => {
    const env = setup();
    seedHold(env);
    env.clock.advance(HOLD_TTL_MS + 60_000);
    env.rpc.pay(guest, STAY);
    expect(await release(env)).toHaveLength(1);
    expect(env.repo.rows.size).toBe(1);
  });

  test("nothing is released while the chain cannot be read", async () => {
    const env = setup();
    seedHold(env);
    env.clock.advance(HOLD_TTL_MS * 3);
    env.rpc.failing = true;
    expect(await release(env)).toHaveLength(1);
    expect(env.repo.rows.size).toBe(1);
  });

  test("a paid confirmed booking never expires", async () => {
    const env = setup();
    env.rpc.pay(guest, STAY);
    seedHold(env, "confirmed");
    env.clock.advance(HOLD_TTL_MS * 100);
    expect(await release(env)).toHaveLength(1);
    expect([...env.repo.rows.values()][0].status).toBe("confirmed");
  });

  test("a confirmed booking refunded before check-in is marked cancelled", async () => {
    const env = setup();
    const booking = seedHold(env, "confirmed");
    expect(await release(env)).toEqual([]);
    expect(env.repo.rows.get(booking.id)?.status).toBe("cancelled");
  });

  test("a confirmed booking whose escrow closed from check-in on keeps its nights", async () => {
    const env = setup();
    const booking = seedHold(env, "confirmed");
    env.clock.now = Date.parse(`${STAY.checkInDate}T00:00:00Z`);
    expect(await release(env)).toHaveLength(1);
    expect(env.repo.rows.get(booking.id)?.status).toBe("confirmed");
  });

  test("a refunded confirmed booking is kept while the chain cannot be read", async () => {
    const env = setup();
    const booking = seedHold(env, "confirmed");
    env.rpc.failing = true;
    expect(await release(env)).toHaveLength(1);
    expect(env.repo.rows.get(booking.id)?.status).toBe("confirmed");
  });

  test("reads Postgres timestamps with microseconds", () => {
    expect(parseTimestamp("2026-11-23T12:00:00.123456+00:00")).toBe(
      Date.parse("2026-11-23T12:00:00.123Z"),
    );
  });
});
