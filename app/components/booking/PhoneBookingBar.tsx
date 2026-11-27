import { CalendarDays, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  compactStayDates,
  nightsLabel,
  spokenStaySummary,
} from "@/lib/booking/stay-summary";

export interface PickedStay {
  checkIn: Date;
  checkOut: Date;
  nights: number;
  totalUsdc: number;
}

interface PhoneBookingBarProps {
  pricePerNight: number;
  /** The complete range picked in the booking card's calendar, if any. */
  stay: PickedStay | null;
  /** Brings the booking card's calendar into view. */
  onCheckDates: () => void;
  /** The booking card's own pay handler and state, shared, not copied. */
  onBook: () => void;
  bookDisabled: boolean;
  connected: boolean;
  connecting: boolean;
  busy: boolean;
}

/**
 * Phones only: the booking card sits far below the photos and details, so
 * this bar keeps the price and the next step at the bottom of the screen.
 * Before dates are picked it leads to the calendar; after, it shows the
 * stay and its total next to a Book button that runs the card's booking.
 * It is part of the booking card, so it never holds booking state itself.
 */
const PhoneBookingBar = ({
  pricePerNight,
  stay,
  onCheckDates,
  onBook,
  bookDisabled,
  connected,
  connecting,
  busy,
}: PhoneBookingBarProps) => {
  const bookContent = !connected ? (
    connecting ? (
      "Connecting..."
    ) : (
      <>
        <Wallet aria-hidden="true" />
        Connect wallet
      </>
    )
  ) : busy ? (
    <>
      <Loader2 aria-hidden="true" className="animate-spin" />
      Booking...
    </>
  ) : (
    "Book"
  );

  return (
    <div
      data-phone-booking-bar=""
      data-testid="phone-booking-bar"
      className="fixed inset-x-0 bottom-0 z-30 bg-background pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_var(--color-border),0_-4px_16px_-4px_rgb(0_0_0/0.12)] md:hidden"
    >
      <div className="flex h-(--phone-booking-bar-height) items-center justify-between gap-3 px-4">
        {stay ? (
          <button
            type="button"
            onClick={onCheckDates}
            className="flex min-h-11 min-w-0 cursor-pointer flex-col justify-center rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <span className="text-base leading-tight font-bold">
              {stay.totalUsdc} USDC
            </span>
            <span className="truncate text-sm text-muted-foreground underline underline-offset-2">
              {compactStayDates(stay.checkIn, stay.checkOut)} ·{" "}
              {nightsLabel(stay.nights)}
            </span>
            <span className="sr-only">, change dates</span>
          </button>
        ) : (
          <p className="min-w-0 text-muted-foreground">
            <span className="text-lg font-bold text-foreground">
              {pricePerNight} USDC
            </span>{" "}
            / night
          </p>
        )}
        {stay ? (
          <Button
            size="lg"
            className="h-11 min-w-24 cursor-pointer"
            disabled={bookDisabled}
            onClick={onBook}
          >
            {bookContent}
          </Button>
        ) : (
          <Button
            size="lg"
            className="h-11 cursor-pointer"
            onClick={onCheckDates}
          >
            <CalendarDays aria-hidden="true" />
            Check dates
          </Button>
        )}
      </div>
      <p aria-live="polite" className="sr-only">
        {stay
          ? spokenStaySummary(
              stay.checkIn,
              stay.checkOut,
              stay.nights,
              stay.totalUsdc,
            )
          : ""}
      </p>
    </div>
  );
};

export default PhoneBookingBar;
