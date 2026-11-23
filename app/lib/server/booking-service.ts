import { createHash, randomBytes } from "node:crypto";
import { HOLD_TTL_MS, SESSION_TTL_MS } from "@/lib/booking/auth-message";
import {
  isApartmentId,
  parseDay,
  parseStay,
  Stay,
  validateNewStay,
} from "@/lib/booking/limits";
import type { AuthStore } from "./auth-store";
import {
  BookingRow,
  BookingsRepo,
  BookingStatus,
  OverlapError,
} from "./bookings-repo";
import type { EscrowChain } from "./chain";
import { escrowsOpen, isTxSignature, verifyFunding } from "./escrow-proof";
import { releaseStaleBookings, releaseWalletHolds } from "./holds";
import {
  AuthFailure,
  AuthResult,
  consumeSignature,
  FOLLOW_UP_MAX_AGE_MS,
  SIGNATURE_MAX_AGE_MS,
  verifySignedRequest,
} from "./signed-request";

/**
 * What every /api/bookings route does, independent of Next.js. Each write
 * checks, in order: the request's shape and the booking limits, the wallet
 * signature for exactly this action and stay, ownership of the booking, and
 * the chain where the change depends on a payment. Only then is the
 * signature marked used and the row written.
 */

export interface ServiceDeps {
  repo: () => BookingsRepo;
  chain: () => EscrowChain;
  store: () => AuthStore;
  now: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Shared across requests: see HoldDeps.openEscrows. */
  openEscrows?: Map<string, number>;
}

export interface ServiceResult {
  status: number;
  body: unknown;
}

const reply = (status: number, body: unknown): ServiceResult => ({
  status,
  body,
});
const fail = (status: number, error: string) => reply(status, { error });
const fromAuth = ({ status, error }: AuthFailure) => fail(status, error);

const NOT_FOUND = "Booking not found.";
const TAKEN = "Those dates are no longer available.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const asObject = (body: unknown): Record<string, unknown> =>
  body !== null && typeof body === "object"
    ? (body as Record<string, unknown>)
    : {};

const sameStay = (row: BookingRow, wallet: string, stay: Stay) =>
  row.guest_wallet === wallet &&
  row.apartment_id === stay.apartmentId &&
  row.check_in_date === stay.checkInDate &&
  row.check_out_date === stay.checkOutDate;

/** The columns a guest or the public may see. */
const guestView = (row: BookingRow) => ({
  id: row.id,
  apartment_id: row.apartment_id,
  check_in_date: row.check_in_date,
  check_out_date: row.check_out_date,
  status: row.status,
  tx_signature: row.tx_signature,
});

/** Overlapping bookings still standing once stale bookings are released. */
const standingOverlaps = async (stay: Stay, deps: ServiceDeps, now: number) =>
  releaseStaleBookings(
    await deps
      .repo()
      .activeOverlapping(stay.apartmentId, stay.checkInDate, stay.checkOutDate),
    {
      repo: deps.repo(),
      chain: deps.chain(),
      now,
      openEscrows: deps.openEscrows,
    },
  );

/**
 * Whether the stay's escrow is open on chain, or a 503 if it can't be read.
 * With `retryWhile`, an answer equal to it is read up to 3 times, since our
 * RPC node can lag behind the browser's.
 */
const escrowOpen = async (
  deps: ServiceDeps,
  wallet: string,
  stay: Stay,
  retryWhile?: boolean,
): Promise<boolean | ServiceResult> => {
  const attempts = retryWhile === undefined ? 1 : 3;
  try {
    for (let attempt = 1; ; attempt++) {
      const [open] = await escrowsOpen(deps.chain(), [{ wallet, stay }]);
      if (open !== retryWhile || attempt >= attempts) return open;
      await deps.sleep?.(1500);
    }
  } catch (error) {
    console.error("escrow check failed:", error);
    return fail(
      503,
      "We couldn't check the escrow on the network. Please try again.",
    );
  }
};

/** POST /api/bookings: hold the nights for a signed, valid stay. */
export const createHold = async (
  input: unknown,
  deps: ServiceDeps,
): Promise<ServiceResult> => {
  const body = asObject(input);
  const now = deps.now();
  const checked = validateNewStay(body, now);
  if (!checked.ok) return fail(400, checked.error);
  const { stay } = checked;

  const auth = verifySignedRequest(
    body.auth,
    { action: "reserve", ...stay },
    { now, maxAgeMs: SIGNATURE_MAX_AGE_MS },
  );
  if (!auth.ok) return fromAuth(auth);

  const repo = deps.repo();
  const holdDeps = { repo, chain: deps.chain(), now };
  await releaseWalletHolds(auth.wallet, holdDeps);
  if ((await standingOverlaps(stay, deps, now)).length > 0) {
    return fail(409, TAKEN);
  }

  const used = await consumeSignature(deps.store(), auth, SIGNATURE_MAX_AGE_MS);
  if (used) return fromAuth(used);

  try {
    const booking = await repo.insert({
      apartment_id: stay.apartmentId,
      check_in_date: stay.checkInDate,
      check_out_date: stay.checkOutDate,
      guest_wallet: auth.wallet,
      status: "pending",
    });
    return reply(201, {
      booking: guestView(booking),
      holdExpiresAt: new Date(now + HOLD_TTL_MS).toISOString(),
    });
  } catch (error) {
    if (error instanceof OverlapError) return fail(409, TAKEN);
    throw error;
  }
};

/** Checks the reserve signature that a hold's follow-up requests carry. */
const verifyHoldOwner = (
  body: Record<string, unknown>,
  now: number,
): { stay: Stay; auth: AuthResult } | ServiceResult => {
  if (typeof body.bookingId !== "string" || !UUID.test(body.bookingId)) {
    return fail(400, "A valid bookingId is required.");
  }
  const parsed = parseStay(body);
  if (!parsed.ok) return fail(400, parsed.error);
  const auth = verifySignedRequest(
    body.auth,
    { action: "reserve", ...parsed.stay },
    { now, maxAgeMs: FOLLOW_UP_MAX_AGE_MS },
  );
  if (!auth.ok) return fromAuth(auth);
  return { stay: parsed.stay, auth };
};

/**
 * PATCH /api/bookings with status "confirmed": the hold's guest reports the
 * payment, and the transaction must have funded this stay's escrow.
 */
const confirmBooking = async (
  body: Record<string, unknown>,
  deps: ServiceDeps,
): Promise<ServiceResult> => {
  const now = deps.now();
  if (!isTxSignature(body.txSignature)) {
    return fail(400, "A valid txSignature is required to confirm.");
  }
  const owner = verifyHoldOwner(body, now);
  if ("status" in owner) return owner;
  const { stay, auth } = owner;
  const bookingId = body.bookingId as string;
  const txSignature = body.txSignature;

  const funding = await verifyFunding(
    deps.chain(),
    txSignature,
    auth.wallet,
    stay,
    { sleep: deps.sleep },
  );
  if (!funding.ok) return fail(funding.status, funding.error);
  const open = await escrowOpen(deps, auth.wallet, stay, false);
  if (open !== true) {
    return open === false
      ? fail(409, "The escrow for this stay is no longer open.")
      : open;
  }

  const repo = deps.repo();
  const row = await repo.byId(bookingId);
  if (row) {
    if (!sameStay(row, auth.wallet, stay)) return fail(404, NOT_FOUND);
    if (row.status === "confirmed" && row.tx_signature === txSignature) {
      return reply(200, { booking: guestView(row) });
    }
    const updated = await repo.setStatus(
      bookingId,
      ["pending"],
      "confirmed",
      txSignature,
    );
    return updated
      ? reply(200, { booking: guestView(updated) })
      : fail(409, "This booking can no longer be confirmed.");
  }

  // The hold was released before the payment landed (it took longer than
  // the hold lasts). The payment is real, so book the nights if still free.
  if ((await standingOverlaps(stay, deps, now)).length > 0) {
    return fail(
      409,
      "Your payment is in escrow, but these nights were booked by someone else after your hold expired. Cancel the booking in My Bookings for a full refund.",
    );
  }
  try {
    const booking = await repo.insert({
      apartment_id: stay.apartmentId,
      check_in_date: stay.checkInDate,
      check_out_date: stay.checkOutDate,
      guest_wallet: auth.wallet,
      status: "confirmed",
      tx_signature: txSignature,
    });
    return reply(200, { booking: guestView(booking) });
  } catch (error) {
    if (error instanceof OverlapError) return fail(409, TAKEN);
    throw error;
  }
};

/**
 * PATCH /api/bookings with status "cancelled": the guest refunded the
 * escrow on chain and signed a cancel for their booking of that room and
 * check-in day.
 */
const cancelBooking = async (
  body: Record<string, unknown>,
  deps: ServiceDeps,
): Promise<ServiceResult> => {
  const now = deps.now();
  const { apartmentId, checkInDate } = body;
  if (!isApartmentId(apartmentId) || parseDay(checkInDate) === null) {
    return fail(400, "A room and a check-in day are required to cancel.");
  }
  const auth = verifySignedRequest(
    body.auth,
    { action: "cancel", apartmentId, checkInDate: checkInDate as string },
    { now, maxAgeMs: SIGNATURE_MAX_AGE_MS },
  );
  if (!auth.ok) return fromAuth(auth);

  const repo = deps.repo();
  const row = await repo.activeStay(
    auth.wallet,
    apartmentId,
    checkInDate as string,
  );
  if (!row) return fail(404, NOT_FOUND);

  const open = await escrowOpen(
    deps,
    auth.wallet,
    {
      apartmentId,
      checkInDate: row.check_in_date,
      checkOutDate: row.check_out_date,
    },
    true,
  );
  if (typeof open !== "boolean") return open;
  if (open) {
    return fail(
      409,
      "The escrow for this booking is still open. Cancel it in your wallet first.",
    );
  }

  const used = await consumeSignature(deps.store(), auth, SIGNATURE_MAX_AGE_MS);
  if (used) return fromAuth(used);

  if (row.status === "pending") {
    return (await repo.deletePending(row.id))
      ? reply(200, { booking: { ...guestView(row), status: "cancelled" } })
      : fail(404, NOT_FOUND);
  }
  const updated = await repo.setStatus(row.id, ["confirmed"], "cancelled");
  return updated
    ? reply(200, { booking: guestView(updated) })
    : fail(404, NOT_FOUND);
};

/** PATCH /api/bookings */
export const updateBooking = async (
  input: unknown,
  deps: ServiceDeps,
): Promise<ServiceResult> => {
  const body = asObject(input);
  const status = body.status as BookingStatus | undefined;
  if (status === "confirmed") return confirmBooking(body, deps);
  if (status === "cancelled") return cancelBooking(body, deps);
  return fail(400, 'status must be "confirmed" or "cancelled".');
};

/**
 * DELETE /api/bookings: the guest releases their own unpaid hold, for
 * example after refusing the payment in the wallet.
 */
export const releaseHold = async (
  input: unknown,
  deps: ServiceDeps,
): Promise<ServiceResult> => {
  const body = asObject(input);
  const owner = verifyHoldOwner(body, deps.now());
  if ("status" in owner) return owner;
  const { stay, auth } = owner;

  const repo = deps.repo();
  const row = await repo.byId(body.bookingId as string);
  if (!row || !sameStay(row, auth.wallet, stay)) return fail(404, NOT_FOUND);
  if (row.status !== "pending") {
    return fail(409, "Only an unpaid hold can be released.");
  }

  const open = await escrowOpen(deps, auth.wallet, stay);
  if (typeof open !== "boolean") return open;
  if (open) {
    return fail(409, "This booking is paid, so its nights stay booked.");
  }

  return (await repo.deletePending(row.id))
    ? reply(200, { success: true })
    : fail(409, "Only an unpaid hold can be released.");
};

/** POST /api/bookings/availability (public). */
export const checkAvailability = async (
  input: unknown,
  deps: ServiceDeps,
): Promise<ServiceResult> => {
  const parsed = parseStay(asObject(input));
  if (!parsed.ok) return fail(400, parsed.error);
  const standing = await standingOverlaps(parsed.stay, deps, deps.now());
  return reply(200, {
    available: standing.length === 0,
    conflicts: standing.map((row) => ({
      check_in_date: row.check_in_date,
      check_out_date: row.check_out_date,
      status: row.status,
    })),
  });
};

/** GET /api/bookings/booked-dates (public). */
export const bookedDates = async (
  apartmentIdParam: string | null,
  deps: ServiceDeps,
): Promise<ServiceResult> => {
  const apartmentId = Number(apartmentIdParam);
  if (!apartmentIdParam || !isApartmentId(apartmentId)) {
    return fail(400, "This room does not exist.");
  }
  const repo = deps.repo();
  const standing = await releaseStaleBookings(
    await repo.activeForApartment(apartmentId),
    {
      repo,
      chain: deps.chain(),
      now: deps.now(),
      openEscrows: deps.openEscrows,
    },
  );
  return reply(200, {
    bookings: standing.map((row) => ({
      check_in_date: row.check_in_date,
      check_out_date: row.check_out_date,
    })),
  });
};

const sessionKey = (token: string) =>
  `session:${createHash("sha256").update(token).digest("hex")}`;

/**
 * POST /api/bookings/session: trades a signed "view" message for a
 * short-lived token, so My Bookings does not ask for a signature on every
 * page load.
 */
export const startSession = async (
  input: unknown,
  deps: ServiceDeps,
): Promise<ServiceResult> => {
  const now = deps.now();
  const auth = verifySignedRequest(
    asObject(input).auth,
    { action: "view" },
    { now, maxAgeMs: SIGNATURE_MAX_AGE_MS },
  );
  if (!auth.ok) return fromAuth(auth);
  const store = deps.store();
  const used = await consumeSignature(store, auth, SIGNATURE_MAX_AGE_MS);
  if (used) return fromAuth(used);

  const token = randomBytes(32).toString("base64url");
  try {
    await store.put(sessionKey(token), auth.wallet, SESSION_TTL_MS);
  } catch (error) {
    console.error("auth store unavailable:", error);
    return fail(503, "We couldn't sign you in right now. Please try again.");
  }
  return reply(201, {
    token,
    wallet: auth.wallet,
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  });
};

/** GET /api/bookings/guest: the session wallet's own bookings. */
export const guestBookings = async (
  authorization: string | null,
  deps: ServiceDeps,
): Promise<ServiceResult> => {
  const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{20,})$/)?.[1];
  if (!token) return fail(401, "Sign in with your wallet to see bookings.");
  let wallet: string | null;
  try {
    wallet = await deps.store().get(sessionKey(token));
  } catch (error) {
    console.error("auth store unavailable:", error);
    return fail(503, "We couldn't check your sign-in. Please try again.");
  }
  if (!wallet) return fail(401, "Your sign-in expired. Please sign again.");

  const rows = await deps.repo().forGuest(wallet);
  return reply(200, { wallet, bookings: rows.map(guestView) });
};
