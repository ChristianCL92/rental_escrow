import { HOLD_TTL_MS } from "@/lib/booking/auth-message";
import { rentTimeForDay } from "@/lib/booking/escrow";
import type { BookingRow, BookingsRepo } from "./bookings-repo";
import type { EscrowChain } from "./chain";
import { escrowsOpen } from "./escrow-proof";

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
 */

/** Postgres timestamps can carry microseconds; JS dates keep milliseconds. */
export const parseTimestamp = (value: string): number =>
  Date.parse(value.replace(/(\.\d{3})\d+/, "$1"));

export const isExpiredHold = (row: BookingRow, now: number): boolean =>
  row.status === "pending" &&
  parseTimestamp(row.created_at) <= now - HOLD_TTL_MS;

/** A confirmed booking whose escrow could still only close by a refund. */
export const isRefundableBooking = (row: BookingRow, now: number): boolean =>
  row.status === "confirmed" &&
  now < rentTimeForDay(row.check_in_date) * 1000;

export interface HoldDeps {
  repo: BookingsRepo;
  chain: EscrowChain;
  now: number;
}

const stayOf = (row: BookingRow) => ({
  wallet: row.guest_wallet,
  stay: {
    apartmentId: row.apartment_id,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
  },
});

/**
 * Releases the holds among `rows` that `shouldRelease` picks and whose
 * escrow is not open on chain, and returns the rows that still stand. If the
 * chain cannot be read, nothing is released.
 */
const releaseHolds = async (
  rows: BookingRow[],
  shouldRelease: (row: BookingRow) => boolean,
  { repo, chain }: HoldDeps,
  createdBefore?: string,
): Promise<BookingRow[]> => {
  const candidates = rows.filter(shouldRelease);
  if (candidates.length === 0) return rows;

  let open: boolean[];
  try {
    open = await escrowsOpen(chain, candidates.map(stayOf));
  } catch (error) {
    console.error("escrow check failed, keeping holds:", error);
    return rows;
  }

  const released = new Set<string>();
  await Promise.all(
    candidates.map(async (row, i) => {
      if (open[i]) return;
      try {
        const done =
          row.status === "pending"
            ? await repo.deletePending(row.id, createdBefore)
            : (await repo.setStatus(row.id, ["confirmed"], "cancelled")) !==
              null;
        if (done) {
          released.add(row.id);
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
      isExpiredHold(row, deps.now) || isRefundableBooking(row, deps.now),
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
