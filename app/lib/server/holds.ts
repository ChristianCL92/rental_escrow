import { HOLD_TTL_MS } from "@/lib/booking/auth-message";
import { rentTimeForDay } from "@/lib/booking/escrow";
import type { BookingRow, BookingsRepo } from "./bookings-repo";
import type { EscrowChain } from "./chain";
import { escrowsOpen, holdOf, paidAmount, StayOf } from "./escrow-proof";

/**
 * Unpaid holds expire. A hold is the pending row created when the guest
 * signs; if its escrow payment has not landed on chain within HOLD_TTL_MS,
 * its nights are released. There is no background job: expired holds are
 * found and released whenever a request looks at the nights they cover
 * (availability, booked dates, a new hold), always after checking the chain,
 * so a payment that landed late keeps its nights.
 *
 * Releasing an unpaid hold deletes the row; no money moved, so no record is
 * kept.
 *
 * A confirmed booking is released the same way once its guest refunded the
 * escrow on chain, even if they never told the server: before check-in only
 * a refund can close the escrow (the owner's payout opens at check-in), so a
 * closed escrow then means the booking was cancelled. Its row is marked
 * cancelled, which the overlap constraint in supabase/schema.sql ignores.
 * An escrow that holds less than the booking's payment, read from its
 * transaction, no longer backs it and counts as closed. Like a hold, a
 * booking is only looked at once it has stood HOLD_TTL_MS since it was
 * confirmed, so a lagging RPC node cannot pass a fresh payment off as a
 * refund, and only until check-in. An escrow read as open is not read again
 * for OPEN_RECHECK_MS.
 */

export const OPEN_RECHECK_MS = 60_000;

/** Postgres timestamps can carry microseconds; JS dates keep milliseconds. */
export const parseTimestamp = (value: string): number =>
  Date.parse(value.replace(/(\.\d{3})\d+/, "$1"));

export const isExpiredHold = (row: BookingRow, now: number): boolean =>
  row.status === "pending" &&
  parseTimestamp(row.created_at) <= now - HOLD_TTL_MS;

/** A confirmed booking whose escrow could by now only close by a refund. */
export const isRefundableBooking = (row: BookingRow, now: number): boolean =>
  row.status === "confirmed" &&
  parseTimestamp(row.updated_at) <= now - HOLD_TTL_MS &&
  now < rentTimeForDay(row.check_in_date) * 1000;

export interface HoldDeps {
  repo: BookingsRepo;
  chain: EscrowChain;
  now: number;
  /** When each confirmed booking's escrow was last read as open, by id. */
  openEscrows?: Map<string, number>;
}

/** The escrow a booking row stands for. */
export const escrowOf = (row: BookingRow, chain: EscrowChain): StayOf => {
  const stay = {
    apartmentId: row.apartment_id,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
  };
  if (row.status === "pending") return holdOf(row.guest_wallet, stay);
  return {
    wallet: row.guest_wallet,
    stay,
    amount: () => paidAmount(chain, row.tx_signature, row.guest_wallet, stay),
  };
};

/**
 * Releases the holds among `rows` that `shouldRelease` picks and whose
 * escrow is not open on chain, and returns the rows that still stand. If the
 * chain cannot be read, nothing is released.
 */
const releaseHolds = async (
  rows: BookingRow[],
  shouldRelease: (row: BookingRow) => boolean,
  { repo, chain, now, openEscrows }: HoldDeps,
  createdBefore?: string,
): Promise<BookingRow[]> => {
  const candidates = rows.filter(shouldRelease);
  if (candidates.length === 0) return rows;

  let open: boolean[];
  try {
    open = await escrowsOpen(
      chain,
      candidates.map((row) => escrowOf(row, chain)),
    );
  } catch (error) {
    console.error("escrow check failed, keeping holds:", error);
    return rows;
  }

  const released = new Set<string>();
  await Promise.all(
    candidates.map(async (row, i) => {
      if (open[i]) {
        if (row.status === "confirmed") openEscrows?.set(row.id, now);
        return;
      }
      try {
        const done =
          row.status === "pending"
            ? await repo.deletePending(row.id, createdBefore)
            : (await repo.setStatus(row.id, ["confirmed"], "cancelled")) !==
              null;
        if (done) {
          released.add(row.id);
          openEscrows?.delete(row.id);
        }
      } catch (error) {
        console.error("could not release hold", row.id, error);
      }
    }),
  );
  return rows.filter((row) => !released.has(row.id));
};

/**
 * Releases the expired, unpaid holds and the refunded confirmed bookings
 * among `rows`; returns the rest.
 */
export const releaseStaleBookings = (
  rows: BookingRow[],
  deps: HoldDeps,
): Promise<BookingRow[]> =>
  releaseHolds(
    rows,
    (row) =>
      isExpiredHold(row, deps.now) ||
      (isRefundableBooking(row, deps.now) &&
        !(
          (deps.openEscrows?.get(row.id) ?? -Infinity) >
          deps.now - OPEN_RECHECK_MS
        )),
    deps,
    // Only delete what is still expired at write time.
    new Date(deps.now - HOLD_TTL_MS).toISOString(),
  );

/**
 * A wallet holds one unpaid stay at a time: a new hold replaces the wallet's
 * earlier unpaid holds, so one wallet cannot fill the calendar.
 */
export const releaseWalletHolds = async (
  wallet: string,
  deps: HoldDeps,
): Promise<void> => {
  const pending = await deps.repo.pendingForGuest(wallet);
  await releaseHolds(pending, () => true, deps);
};
