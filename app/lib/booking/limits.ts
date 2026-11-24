import { PublicKey } from "@solana/web3.js";
import { properties } from "@/lib/properties";

/**
 * Booking limits. The server enforces them on every hold; the calendar uses
 * the same numbers so a guest cannot pick a stay the server would refuse.
 *
 * Dates travel as "yyyy-mm-dd" calendar days. "Today" is the UTC day,
 * because the escrow program refuses a check-in (`rent_time`, midnight UTC)
 * before the start of the current UTC day.
 */

export const MAX_NIGHTS = 30;
export const MAX_MONTHS_AHEAD = 12;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "yyyy-mm-dd" of the UTC calendar day that contains `ms`. */
export const utcDay = (ms: number): string =>
  new Date(ms).toISOString().slice(0, 10);

/** UTC midnight of a real "yyyy-mm-dd" day, or null for anything else. */
export const parseDay = (value: unknown): number | null => {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  // Date.parse rolls "2026-02-30" over to March; a real day round-trips.
  return Number.isNaN(ms) || utcDay(ms) !== value ? null : ms;
};

/** The latest day a stay may reach: 12 months from today (UTC). */
export const lastBookableDay = (now: number): string => {
  const today = new Date(now);
  return utcDay(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth() + MAX_MONTHS_AHEAD,
      today.getUTCDate(),
    ),
  );
};

export const nightsBetween = (checkIn: string, checkOut: string): number =>
  Math.round(((parseDay(checkOut) ?? 0) - (parseDay(checkIn) ?? 0)) / DAY_MS);

export const isApartmentId = (value: unknown): value is number =>
  typeof value === "number" &&
  properties.some((property) => property.apartmentId === value);

/** A base58 Solana address of a real ed25519 key (a wallet, not a PDA). */
export const isWalletAddress = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) {
    return false;
  }
  try {
    const key = new PublicKey(value);
    return key.toBase58() === value && PublicKey.isOnCurve(key.toBytes());
  } catch {
    return false;
  }
};

export interface Stay {
  apartmentId: number;
  checkInDate: string;
  checkOutDate: string;
}

export type StayCheck =
  | { ok: true; stay: Stay; nights: number }
  | { ok: false; error: string };

/** Shape checks only: a real apartment and two real days in order. */
export const parseStay = (input: {
  apartmentId?: unknown;
  checkInDate?: unknown;
  checkOutDate?: unknown;
}): StayCheck => {
  const { apartmentId, checkInDate, checkOutDate } = input;
  if (!isApartmentId(apartmentId)) {
    return { ok: false, error: "This room does not exist." };
  }
  const checkIn = parseDay(checkInDate);
  const checkOut = parseDay(checkOutDate);
  if (checkIn === null || checkOut === null) {
    return { ok: false, error: "Dates must be real days as yyyy-mm-dd." };
  }
  if (checkOut <= checkIn) {
    return { ok: false, error: "Check-out must be after check-in." };
  }
  const stay = {
    apartmentId,
    checkInDate: checkInDate as string,
    checkOutDate: checkOutDate as string,
  };
  return {
    ok: true,
    stay,
    nights: nightsBetween(stay.checkInDate, stay.checkOutDate),
  };
};

/** Everything a new hold must satisfy, at time `now`. */
export const validateNewStay = (
  input: Parameters<typeof parseStay>[0],
  now: number,
): StayCheck => {
  const parsed = parseStay(input);
  if (!parsed.ok) return parsed;
  const { stay, nights } = parsed;
  if (stay.checkInDate < utcDay(now)) {
    return { ok: false, error: "Check-in can't be in the past." };
  }
  if (nights > MAX_NIGHTS) {
    return {
      ok: false,
      error: `A stay can be at most ${MAX_NIGHTS} nights.`,
    };
  }
  if (stay.checkOutDate > lastBookableDay(now)) {
    return {
      ok: false,
      error: `Stays can be booked at most ${MAX_MONTHS_AHEAD} months ahead.`,
    };
  }
  return parsed;
};
