/**
 * Guest-facing escrow rules, mirroring programs/rental_escrow:
 * - initialize stores `rent_time` = 00:00 UTC on the check-in calendar date;
 * - cancel_booking refunds the full amount only while now < rent_time;
 * - release_payment lets the host collect only once now >= rent_time.
 * Keep the wording in the UI tied to these helpers so it cannot drift from
 * what the program enforces.
 */

/**
 * The on-chain check-in instant for a date picked in the calendar: midnight
 * UTC of the guest's chosen calendar day. This is both the refund deadline and
 * the earliest moment the host can collect the payment.
 */
export const escrowCheckInTime = (checkIn: Date): Date =>
  new Date(
    Date.UTC(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate()),
  );

/**
 * The reverse of escrowCheckInTime: the guest's check-in calendar day for an
 * on-chain `rent_time`, as a local date. Formatting the raw instant instead
 * would show the previous day to guests west of UTC (e.g. Colombia).
 */
export const checkInCalendarDate = (escrowCheckIn: Date): Date =>
  new Date(
    escrowCheckIn.getUTCFullYear(),
    escrowCheckIn.getUTCMonth(),
    escrowCheckIn.getUTCDate(),
  );

/** Unix seconds for the program's `rent_time` argument. */
export const escrowRentTime = (checkIn: Date): number =>
  Math.floor(escrowCheckInTime(checkIn).getTime() / 1000);

/**
 * Formats the refund deadline in the guest's own time zone, with the zone
 * named, e.g. "Nov 19, 7:00 PM GMT-5". The deadline is midnight UTC, which
 * for a guest in Colombia is the evening before check-in, so the time and
 * zone must both be shown.
 */
export const formatDeadline = (
  deadline: Date,
  locale?: string,
  timeZone?: string,
): string =>
  new Intl.DateTimeFormat(locale ?? "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(deadline);

export type BookingPhase = "upcoming" | "active" | "completed";

/** Where a booking stands relative to the escrow rules at time `now`. */
export const bookingPhase = (
  booking: { checkInDate: Date; rentEnded: boolean },
  now: number,
): BookingPhase => {
  if (booking.rentEnded) return "completed";
  return booking.checkInDate.getTime() <= now ? "active" : "upcoming";
};
