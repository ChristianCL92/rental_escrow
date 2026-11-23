import { HOLD_TTL_MS } from "@/lib/booking/auth-message";
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
 * Releasing deletes the row, because the overlap constraint in
 * supabase/schema.sql also counts rows of any other status.
 */

/** Postgres timestamps can carry microseconds; JS dates keep milliseconds. */
export const parseTimestamp = (value: string): number =>
  Date.parse(value.replace(/(\.\d{3})\d+/, "$1"));

export const isExpiredHold = (row: BookingRow, now: number): boolean =>
  row.status === "pending" &&
  parseTimestamp(row.created_at) <= now - HOLD_TTL_MS;

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
        if (await repo.deletePending(row.id, createdBefore)) {
          released.add(row.id);
        }
      } catch (error) {
        console.error("could not release hold", row.id, error);
      }
    }),
  );
  return rows.filter((row) => !released.has(row.id));
};

/** Releases the expired, unpaid holds among `rows`; returns the rest. */
export const releaseExpiredHolds = (
  rows: BookingRow[],
  deps: HoldDeps,
): Promise<BookingRow[]> =>
  releaseHolds(
    rows,
    (row) => isExpiredHold(row, deps.now),
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
