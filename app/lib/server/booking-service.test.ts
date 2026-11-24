import { describe, expect, test } from "bun:test";
import { Keypair } from "@solana/web3.js";
import { HOLD_TTL_MS, SESSION_TTL_MS } from "@/lib/booking/auth-message";
import { rentTimeForDay } from "@/lib/booking/escrow";
import type { Stay } from "@/lib/booking/limits";
import { properties } from "@/lib/properties";
import {
  bookedDates,
  checkAvailability,
  createHold,
  guestBookings,
  releaseHold,
  startSession,
  updateBooking,
} from "./booking-service";
import { FOLLOW_UP_MAX_AGE_MS } from "./signed-request";
import { signAs, setup, STAY } from "./test-fixtures";

type Env = ReturnType<typeof setup>;

const guest = Keypair.generate();
const attacker = Keypair.generate();

const at = (env: Env) => ({ issuedAt: new Date(env.clock.now).toISOString() });

let nonceCounter = 0;
const fresh = (env: Env) => ({
  ...at(env),
  nonce: (++nonceCounter).toString(16).padStart(16, "0"),
});

const reserve = (env: Env, who = guest, stay: Stay = STAY) =>
  createHold(
    { ...stay, auth: signAs(who, "reserve", stay, fresh(env)) },
    env.deps,
  );

/** A guest's hold, paid on chain, as the browser leaves it. */
const paidHold = async (env: Env, who = guest, stay: Stay = STAY) => {
  const auth = signAs(who, "reserve", stay, fresh(env));
  const created = await createHold({ ...stay, auth }, env.deps);
  const bookingId = (created.body as { booking: { id: string } }).booking.id;
  const txSignature = env.rpc.pay(who, stay);
  return { auth, bookingId, txSignature };
};

/** A guest's hold, paid on chain and confirmed. */
const confirmedBooking = async (env: Env, who = guest, stay: Stay = STAY) => {
  const { auth, bookingId, txSignature } = await paidHold(env, who, stay);
  const result = await updateBooking(
    { bookingId, status: "confirmed", txSignature, ...stay, auth },
    env.deps,
  );
  expect(result.status).toBe(200);
  return { bookingId, txSignature };
};

describe("creating a hold (POST /api/bookings)", () => {
  test("a signed, valid stay is held as pending", async () => {
    const env = setup();
    const result = await reserve(env);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({
      booking: { status: "pending", ...{ apartment_id: 1 } },
      holdExpiresAt: new Date(env.clock.now + HOLD_TTL_MS).toISOString(),
    });
    const [row] = env.repo.rows.values();
    expect(row.guest_wallet).toBe(guest.publicKey.toBase58());
  });

  test("an unsigned request (the Postman hold) is refused", async () => {
    const env = setup();
    const result = await createHold(
      { ...STAY, guestWallet: guest.publicKey.toBase58() },
      env.deps,
    );
    expect(result.status).toBe(401);
    expect(env.repo.rows.size).toBe(0);
  });

  test("a year-long or 31-night hold is refused even when signed", async () => {
    const env = setup();
    for (const checkOutDate of ["2027-11-23", "2026-12-31"]) {
      const stay = { ...STAY, checkOutDate };
      const result = await createHold(
        { ...stay, auth: signAs(guest, "reserve", stay, fresh(env)) },
        env.deps,
      );
      expect(result.status).toBe(400);
    }
    expect(env.repo.rows.size).toBe(0);
  });

  test("a replayed signature cannot create a second hold", async () => {
    const env = setup();
    const auth = signAs(guest, "reserve", STAY, fresh(env));
    expect((await createHold({ ...STAY, auth }, env.deps)).status).toBe(201);
    // Free the nights so only the replay check can stop it.
    env.repo.rows.clear();
    const replay = await createHold({ ...STAY, auth }, env.deps);
    expect(replay).toMatchObject({
      status: 401,
      body: { error: "This signature was already used. Please sign again." },
    });
  });

  test("signing one stay does not authorize another", async () => {
    const env = setup();
    const auth = signAs(guest, "reserve", STAY, fresh(env));
    const result = await createHold(
      { ...STAY, checkOutDate: "2026-12-20", auth },
      env.deps,
    );
    expect(result.status).toBe(401);
  });

  test("a wallet holds one unpaid stay at a time", async () => {
    const env = setup();
    await reserve(env);
    await reserve(env, guest, { ...STAY, apartmentId: 2 });
    await reserve(env, guest, { ...STAY, apartmentId: 3 });
    const rows = [...env.repo.rows.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].apartment_id).toBe(3);
  });

  test("a paid hold is not replaced by the wallet's next hold", async () => {
    const env = setup();
    await paidHold(env);
    await reserve(env, guest, { ...STAY, apartmentId: 2 });
    expect(env.repo.rows.size).toBe(2);
  });

  test("taken nights are refused; an expired unpaid hold frees them", async () => {
    const env = setup();
    await reserve(env);
    expect((await reserve(env, attacker)).status).toBe(409);
    env.clock.advance(HOLD_TTL_MS);
    expect((await reserve(env, attacker)).status).toBe(201);
  });

  test("an expired hold whose payment landed keeps its nights", async () => {
    const env = setup();
    await paidHold(env);
    env.clock.advance(HOLD_TTL_MS * 2);
    expect((await reserve(env, attacker)).status).toBe(409);
  });

  test("an escrow paying less than the stay does not keep an expired hold", async () => {
    const env = setup();
    const month: Stay = { ...STAY, checkOutDate: "2026-12-30" };
    expect((await reserve(env, attacker, month)).status).toBe(201);
    env.rpc.pay(attacker, month, { amount: BigInt(30_000_000) });
    env.clock.advance(HOLD_TTL_MS);
    expect((await reserve(env, guest, month)).status).toBe(201);
  });
});

describe("public availability", () => {
  test("expired unpaid holds stop blocking the calendar", async () => {
    const env = setup();
    await reserve(env);
    const booked = await bookedDates("1", env.deps);
    expect(booked.body).toEqual({
      bookings: [
        { check_in_date: STAY.checkInDate, check_out_date: STAY.checkOutDate },
      ],
    });
    env.clock.advance(HOLD_TTL_MS);
    expect((await bookedDates("1", env.deps)).body).toEqual({ bookings: [] });
    expect(env.repo.rows.size).toBe(0);
  });

  test("availability does not hand out booking ids", async () => {
    const env = setup();
    await reserve(env);
    const result = await checkAvailability(STAY, env.deps);
    expect(result.body).toEqual({
      available: false,
      conflicts: [
        {
          check_in_date: STAY.checkInDate,
          check_out_date: STAY.checkOutDate,
          status: "pending",
        },
      ],
    });
  });

  test("bad input is refused", async () => {
    const env = setup();
    expect((await bookedDates("99", env.deps)).status).toBe(400);
    expect((await bookedDates(null, env.deps)).status).toBe(400);
    expect((await checkAvailability({}, env.deps)).status).toBe(400);
  });
});

describe("confirming (PATCH status confirmed)", () => {
  test("the guest's real payment confirms their hold", async () => {
    const env = setup();
    const { auth, bookingId, txSignature } = await paidHold(env);
    const result = await updateBooking(
      { bookingId, status: "confirmed", txSignature, ...STAY, auth },
      env.deps,
    );
    expect(result.status).toBe(200);
    expect(env.repo.rows.get(bookingId)).toMatchObject({
      status: "confirmed",
      tx_signature: txSignature,
    });
  });

  test("a made-up txSignature cannot fake-confirm a hold", async () => {
    const env = setup();
    const auth = signAs(guest, "reserve", STAY, fresh(env));
    const created = await createHold({ ...STAY, auth }, env.deps);
    const bookingId = (created.body as { booking: { id: string } }).booking.id;
    const result = await updateBooking(
      {
        bookingId,
        status: "confirmed",
        txSignature: "5".repeat(87),
        ...STAY,
        auth,
      },
      env.deps,
    );
    expect(result.status).toBe(409);
    expect(env.repo.rows.get(bookingId)?.status).toBe("pending");
  });

  test("a confirm without the guest's signature is refused", async () => {
    const env = setup();
    const { bookingId, txSignature } = await paidHold(env);
    const result = await updateBooking(
      { bookingId, status: "confirmed", txSignature, ...STAY },
      env.deps,
    );
    expect(result.status).toBe(401);
  });

  test("an attacker cannot confirm someone else's hold with their own payment", async () => {
    const env = setup();
    const { bookingId } = await paidHold(env);
    const otherStay = { ...STAY, apartmentId: 4 };
    const theirs = await paidHold(env, attacker, otherStay);
    const result = await updateBooking(
      {
        bookingId,
        status: "confirmed",
        txSignature: theirs.txSignature,
        ...otherStay,
        auth: theirs.auth,
      },
      env.deps,
    );
    expect(result.status).toBe(404);
    expect(env.repo.rows.get(bookingId)?.status).toBe("pending");
  });

  test("a payment that lands after the hold was released books the nights if free", async () => {
    const env = setup();
    const { auth, bookingId } = await paidHold(env);
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    env.clock.advance(HOLD_TTL_MS);
    await bookedDates("1", env.deps); // releases the expired hold
    expect(env.repo.rows.size).toBe(0);

    const txSignature = env.rpc.pay(guest, STAY);
    const result = await updateBooking(
      { bookingId, status: "confirmed", txSignature, ...STAY, auth },
      env.deps,
    );
    expect(result.status).toBe(200);
    expect([...env.repo.rows.values()][0]).toMatchObject({
      status: "confirmed",
      tx_signature: txSignature,
    });
  });

  test("a lagging RPC node does not refuse a real payment's confirm", async () => {
    const env = setup();
    const { auth, bookingId, txSignature } = await paidHold(env);
    env.rpc.lagAccounts(2, new Map());
    const result = await updateBooking(
      { bookingId, status: "confirmed", txSignature, ...STAY, auth },
      env.deps,
    );
    expect(result.status).toBe(200);
    expect(env.repo.rows.get(bookingId)?.status).toBe("confirmed");
  });

  test("a payment whose escrow was refunded cannot confirm the hold", async () => {
    const env = setup();
    const { auth, bookingId, txSignature } = await paidHold(env);
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    const result = await updateBooking(
      { bookingId, status: "confirmed", txSignature, ...STAY, auth },
      env.deps,
    );
    expect(result.status).toBe(409);
    expect(env.repo.rows.get(bookingId)?.status).toBe("pending");
  });

  test("a refunded payment re-opened with less money cannot confirm", async () => {
    const env = setup();
    const month: Stay = { ...STAY, checkOutDate: "2026-12-30" };
    const { auth, bookingId, txSignature } = await paidHold(env, guest, month);
    env.rpc.closeEscrow(guest.publicKey, month.apartmentId);
    env.rpc.openEscrow(
      guest.publicKey,
      month.apartmentId,
      BigInt(30_000_000),
      rentTimeForDay(month.checkInDate),
    );
    const result = await updateBooking(
      { bookingId, status: "confirmed", txSignature, ...month, auth },
      env.deps,
    );
    expect(result.status).toBe(409);
    expect(env.repo.rows.get(bookingId)?.status).toBe("pending");
  });

  test("a refunded payment cannot book the nights after the hold was released", async () => {
    const env = setup();
    const { auth, bookingId, txSignature } = await paidHold(env);
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    env.clock.advance(HOLD_TTL_MS);
    await bookedDates("1", env.deps);
    expect(env.repo.rows.size).toBe(0);
    const result = await updateBooking(
      { bookingId, status: "confirmed", txSignature, ...STAY, auth },
      env.deps,
    );
    expect(result.status).toBe(409);
    expect(env.repo.rows.size).toBe(0);
  });

  test("the reserve signature stops covering the hold after its window", async () => {
    const env = setup();
    const { auth, bookingId, txSignature } = await paidHold(env);
    env.clock.advance(FOLLOW_UP_MAX_AGE_MS + 1);
    const result = await updateBooking(
      { bookingId, status: "confirmed", txSignature, ...STAY, auth },
      env.deps,
    );
    expect(result.status).toBe(401);
  });
});

const cancel = (env: Env, who: Keypair, stay: Stay = STAY, signed = true) =>
  updateBooking(
    {
      status: "cancelled",
      apartmentId: stay.apartmentId,
      checkInDate: stay.checkInDate,
      ...(signed
        ? {
            auth: signAs(
              who,
              "cancel",
              { apartmentId: stay.apartmentId, checkInDate: stay.checkInDate },
              fresh(env),
            ),
          }
        : {}),
    },
    env.deps,
  );

describe("cancelling (PATCH status cancelled)", () => {
  test("is refused while the escrow is still open", async () => {
    const env = setup();
    await paidHold(env);
    expect((await cancel(env, guest)).status).toBe(409);
  });

  test("the guest can record the cancel once the refund closed the escrow", async () => {
    const env = setup();
    const { auth, bookingId, txSignature } = await paidHold(env);
    await updateBooking(
      { bookingId, status: "confirmed", txSignature, ...STAY, auth },
      env.deps,
    );
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    expect((await cancel(env, guest)).status).toBe(200);
    expect(env.repo.rows.get(bookingId)?.status).toBe("cancelled");
  });

  test("a payout after check-in is not taken for a refund", async () => {
    const env = setup();
    const { bookingId } = await confirmedBooking(env);
    env.clock.advance(Date.parse("2026-12-01T12:00:00Z") - env.clock.now);
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    expect((await cancel(env, guest)).status).toBe(409);
    expect(env.repo.rows.get(bookingId)?.status).toBe("confirmed");
  });

  test("cancelling an unpaid hold frees its nights for the next guest", async () => {
    const env = setup();
    const held = await reserve(env, attacker);
    expect(held.status).toBe(201);
    expect((await cancel(env, attacker)).status).toBe(200);
    expect((await reserve(env, guest)).status).toBe(201);
  });

  test("nobody else can cancel the guest's booking", async () => {
    const env = setup();
    const { bookingId } = await paidHold(env);
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    expect((await cancel(env, attacker, STAY, false)).status).toBe(401);
    // A valid signature, but from the attacker's own wallet: it only ever
    // reaches the attacker's own bookings.
    expect((await cancel(env, attacker)).status).toBe(404);
    expect(env.repo.rows.get(bookingId)?.status).toBe("pending");
  });

  test("a cancel signature works once", async () => {
    const env = setup();
    await paidHold(env);
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    const body = {
      status: "cancelled",
      apartmentId: STAY.apartmentId,
      checkInDate: STAY.checkInDate,
      auth: signAs(
        guest,
        "cancel",
        { apartmentId: STAY.apartmentId, checkInDate: STAY.checkInDate },
        fresh(env),
      ),
    };
    expect((await updateBooking(body, env.deps)).status).toBe(200);
    // Rebook (in the table), then replay the old cancel.
    env.repo.seed({
      apartment_id: STAY.apartmentId,
      check_in_date: STAY.checkInDate,
      check_out_date: STAY.checkOutDate,
      guest_wallet: guest.publicKey.toBase58(),
      status: "confirmed",
      tx_signature: env.rpc.pay(guest, STAY),
    });
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    expect((await updateBooking(body, env.deps)).status).toBe(401);
  });

  test("a node that has not yet seen the refund does not refuse the cancel", async () => {
    const env = setup();
    const { bookingId } = await confirmedBooking(env);
    env.rpc.lagAccounts(1);
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    expect((await cancel(env, guest)).status).toBe(200);
    expect(env.repo.rows.get(bookingId)?.status).toBe("cancelled");
  });

  test("a cancelled booking no longer blocks a new hold on its nights", async () => {
    const env = setup();
    await confirmedBooking(env);
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    expect((await cancel(env, guest)).status).toBe(200);
    expect((await reserve(env, attacker)).status).toBe(201);
  });

  test("a booking refunded on chain without telling the server frees its nights", async () => {
    const env = setup();
    const { bookingId } = await confirmedBooking(env);
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    env.clock.advance(HOLD_TTL_MS);
    expect((await reserve(env, attacker)).status).toBe(201);
    expect(env.repo.rows.get(bookingId)?.status).toBe("cancelled");
  });

  test("a paid booking keeps its nights when the room's price changes later", async () => {
    const env = setup();
    const { bookingId } = await confirmedBooking(env);
    const room = properties.find((p) => p.apartmentId === STAY.apartmentId)!;
    const price = room.pricePerNight;
    room.pricePerNight = price * 2;
    try {
      env.clock.advance(HOLD_TTL_MS);
      expect((await reserve(env, attacker)).status).toBe(409);
      expect(env.repo.rows.get(bookingId)?.status).toBe("confirmed");
    } finally {
      room.pricePerNight = price;
    }
  });

  test("an escrow re-opened with less than was paid frees the nights", async () => {
    const env = setup();
    const month: Stay = { ...STAY, checkOutDate: "2026-12-30" };
    const { bookingId } = await confirmedBooking(env, guest, month);
    env.rpc.closeEscrow(guest.publicKey, month.apartmentId);
    env.rpc.openEscrow(
      guest.publicKey,
      month.apartmentId,
      BigInt(30_000_000),
      rentTimeForDay(month.checkInDate),
    );
    env.clock.advance(HOLD_TTL_MS);
    expect((await reserve(env, attacker, month)).status).toBe(201);
    expect(env.repo.rows.get(bookingId)?.status).toBe("cancelled");
  });

  test("an escrow re-opened with more than was paid keeps the booking", async () => {
    const env = setup();
    const { bookingId } = await confirmedBooking(env);
    env.rpc.openEscrow(
      guest.publicKey,
      STAY.apartmentId,
      BigInt(90_000_000),
      rentTimeForDay(STAY.checkInDate),
    );
    env.clock.advance(HOLD_TTL_MS);
    expect((await reserve(env, attacker)).status).toBe(409);
    expect(env.repo.rows.get(bookingId)?.status).toBe("confirmed");
  });

  test("a refund in the last minutes before check-in frees the nights", async () => {
    const env = setup();
    const { bookingId } = await confirmedBooking(env);
    env.clock.advance(
      Date.parse(`${STAY.checkInDate}T00:00:00Z`) - 5 * 60_000 - env.clock.now,
    );
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    expect((await reserve(env, attacker)).status).toBe(201);
    expect(env.repo.rows.get(bookingId)?.status).toBe("cancelled");
  });

  test("a lagging read right after confirm does not free a paid booking", async () => {
    const env = setup();
    const { bookingId } = await confirmedBooking(env);
    env.rpc.lagAccounts(1, new Map());
    expect((await reserve(env, attacker)).status).toBe(409);
    expect(env.repo.rows.get(bookingId)?.status).toBe("confirmed");
  });

  test("calendar loads do not re-read an escrow just seen open", async () => {
    const env = setup();
    await confirmedBooking(env);
    env.clock.advance(HOLD_TTL_MS);
    await bookedDates("1", env.deps);
    env.rpc.calls.length = 0;
    await bookedDates("1", env.deps);
    expect(env.rpc.calls).toEqual([]);
  });

  test("a refund is recorded even when the payment can no longer be read", async () => {
    const env = setup();
    const { bookingId, txSignature } = await confirmedBooking(env);
    env.rpc.transactions.delete(txSignature);
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    expect((await cancel(env, guest)).status).toBe(200);
    expect(env.repo.rows.get(bookingId)?.status).toBe("cancelled");
  });

  test("a refund frees the nights even when the payment can no longer be read", async () => {
    const env = setup();
    const { bookingId, txSignature } = await confirmedBooking(env);
    env.rpc.transactions.delete(txSignature);
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    env.clock.advance(HOLD_TTL_MS);
    expect((await reserve(env, attacker)).status).toBe(201);
    expect(env.repo.rows.get(bookingId)?.status).toBe("cancelled");
  });

  test("an open escrow keeps its booking when the payment cannot be read", async () => {
    const env = setup();
    const { bookingId, txSignature } = await confirmedBooking(env);
    env.rpc.transactions.delete(txSignature);
    env.clock.advance(HOLD_TTL_MS);
    expect((await reserve(env, attacker)).status).toBe(409);
    expect(env.repo.rows.get(bookingId)?.status).toBe("confirmed");
  });

  test("a refunded booking keeps its nights while the chain cannot be read", async () => {
    const env = setup();
    const { bookingId } = await confirmedBooking(env);
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    env.clock.advance(HOLD_TTL_MS);
    env.rpc.failing = true;
    expect((await reserve(env, attacker)).status).toBe(409);
    expect(env.repo.rows.get(bookingId)?.status).toBe("confirmed");
  });

  test("an RPC outage keeps the booking", async () => {
    const env = setup();
    await paidHold(env);
    env.rpc.failing = true;
    expect((await cancel(env, guest)).status).toBe(503);
  });

  test("unknown statuses are refused", async () => {
    const env = setup();
    expect((await updateBooking({ status: "pending" }, env.deps)).status).toBe(
      400,
    );
  });
});

describe("releasing a hold (DELETE /api/bookings)", () => {
  const release = (env: Env, bookingId: string, auth?: unknown, stay = STAY) =>
    releaseHold({ bookingId, ...stay, auth }, env.deps);

  test("the guest releases their own unpaid hold", async () => {
    const env = setup();
    const auth = signAs(guest, "reserve", STAY, fresh(env));
    const created = await createHold({ ...STAY, auth }, env.deps);
    const bookingId = (created.body as { booking: { id: string } }).booking.id;
    expect((await release(env, bookingId, auth)).status).toBe(200);
    expect(env.repo.rows.size).toBe(0);
  });

  test("nobody can delete someone else's booking", async () => {
    const env = setup();
    const { bookingId, auth: guestAuth } = await paidHold(env);
    // The report's DELETE attack: bookingId + guestWallet, unsigned.
    expect(
      (
        await releaseHold(
          { bookingId, guestWallet: guest.publicKey.toBase58() },
          env.deps,
        )
      ).status,
    ).toBe(400);
    expect((await release(env, bookingId)).status).toBe(401);
    // Signed by the attacker for the victim's stay.
    const theirs = signAs(attacker, "reserve", STAY, fresh(env));
    expect((await release(env, bookingId, theirs)).status).toBe(404);
    // Even the guest cannot delete a paid booking.
    expect((await release(env, bookingId, guestAuth)).status).toBe(409);
    expect(env.repo.rows.size).toBe(1);
  });

  test("a confirmed booking cannot be deleted", async () => {
    const env = setup();
    const { auth, bookingId, txSignature } = await paidHold(env);
    await updateBooking(
      { bookingId, status: "confirmed", txSignature, ...STAY, auth },
      env.deps,
    );
    env.rpc.closeEscrow(guest.publicKey, STAY.apartmentId);
    expect((await release(env, bookingId, auth)).status).toBe(409);
    expect(env.repo.rows.size).toBe(1);
  });

  test("bad input is refused", async () => {
    const env = setup();
    expect((await release(env, "not-a-uuid")).status).toBe(400);
  });
});

describe("My Bookings (session and GET /api/bookings/guest)", () => {
  const signIn = async (env: Env, who = guest) => {
    const result = await startSession(
      { auth: signAs(who, "view", {}, fresh(env)) },
      env.deps,
    );
    return result.body as { token: string; expiresAt: string };
  };

  test("listing needs a session; the session shows only the signer's bookings", async () => {
    const env = setup();
    await reserve(env);
    await reserve(env, attacker, { ...STAY, apartmentId: 2 });

    expect((await guestBookings(null, env.deps)).status).toBe(401);
    expect(
      (await guestBookings("Bearer made-up-token-made-up-token", env.deps))
        .status,
    ).toBe(401);

    const { token, expiresAt } = await signIn(env);
    expect(expiresAt).toBe(
      new Date(env.clock.now + SESSION_TTL_MS).toISOString(),
    );
    const result = await guestBookings(`Bearer ${token}`, env.deps);
    expect(result.status).toBe(200);
    const { bookings } = result.body as {
      bookings: { apartment_id: number }[];
    };
    expect(bookings.map((b) => b.apartment_id)).toEqual([1]);
  });

  test("a session expires", async () => {
    const env = setup();
    const { token } = await signIn(env);
    env.clock.advance(SESSION_TTL_MS);
    expect((await guestBookings(`Bearer ${token}`, env.deps)).status).toBe(401);
  });

  test("a sign-in signature cannot be replayed for a second session", async () => {
    const env = setup();
    const auth = signAs(guest, "view", {}, fresh(env));
    expect((await startSession({ auth }, env.deps)).status).toBe(201);
    expect((await startSession({ auth }, env.deps)).status).toBe(401);
  });

  test("a reserve signature cannot be used to sign in", async () => {
    const env = setup();
    const auth = signAs(guest, "reserve", STAY, fresh(env));
    expect((await startSession({ auth }, env.deps)).status).toBe(401);
  });
});
