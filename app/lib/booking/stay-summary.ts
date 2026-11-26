import { format, isSameMonth } from "date-fns";

/** "1 night", "3 nights". */
export const nightsLabel = (nights: number): string =>
  `${nights} night${nights === 1 ? "" : "s"}`;

/**
 * The picked stay in as few characters as a phone bar allows:
 * "Nov 20-23" within one month, "Nov 28 - Dec 3" across months.
 */
export const compactStayDates = (checkIn: Date, checkOut: Date): string =>
  isSameMonth(checkIn, checkOut)
    ? `${format(checkIn, "MMM d")}-${format(checkOut, "d")}`
    : `${format(checkIn, "MMM d")} - ${format(checkOut, "MMM d")}`;

/**
 * The same stay as a screen reader should say it, in words rather than
 * abbreviations and separators: "November 20 to November 23, 3 nights,
 * 90 USDC total".
 */
export const spokenStaySummary = (
  checkIn: Date,
  checkOut: Date,
  nights: number,
  totalUsdc: number,
): string =>
  `${format(checkIn, "MMMM d")} to ${format(checkOut, "MMMM d")}, ${nightsLabel(nights)}, ${totalUsdc} USDC total`;
