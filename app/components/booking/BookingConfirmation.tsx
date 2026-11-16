"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { CircleCheck, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { explorerUrl } from "@/lib/solana/network";
import DismissButton from "./DismissButton";

export interface ConfirmedBooking {
  checkIn: Date;
  checkOut: Date;
  nights: number;
  totalUsdc: number;
  /** Refund deadline, already formatted for the guest. */
  deadline: string;
  txSignature: string;
}

interface BookingConfirmationProps {
  booking: ConfirmedBooking;
  onDismiss: () => void;
}

/**
 * What the guest just bought and where the money is. Focus moves to the
 * heading so keyboard and screen-reader users land on it.
 */
const BookingConfirmation = ({
  booking,
  onDismiss,
}: BookingConfirmationProps) => {
  const headingId = useId();
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const sameYear =
    booking.checkIn.getFullYear() === booking.checkOut.getFullYear();
  const dates = `${format(booking.checkIn, sameYear ? "MMM d" : "MMM d, yyyy")} - ${format(booking.checkOut, "MMM d, yyyy")}`;

  const rows: [string, string][] = [
    ["Dates", dates],
    ["Nights", String(booking.nights)],
    ["Held in escrow", `${booking.totalUsdc} USDC, until check-in`],
    ["Free cancellation", `Until ${booking.deadline}`],
  ];

  return (
    <Alert
      variant="success"
      role="region"
      aria-labelledby={headingId}
      className="mt-4 pr-10"
      data-testid="booking-confirmation"
    >
      <CircleCheck aria-hidden="true" />
      <AlertTitle
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="line-clamp-none text-base font-semibold outline-none"
      >
        Booking confirmed
      </AlertTitle>
      <AlertDescription className="gap-3">
        <dl className="grid w-full gap-y-2 sm:grid-cols-[auto_1fr] sm:gap-x-4 sm:gap-y-1.5">
          {rows.map(([term, value]) => (
            <div key={term} className="sm:contents">
              <dt className="text-emerald-900">{term}</dt>
              <dd className="font-medium text-emerald-950">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
          <Button asChild size="sm">
            <Link href="/bookings">View my booking</Link>
          </Button>
          <a
            href={explorerUrl("tx", booking.txSignature)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2 hover:decoration-2"
          >
            View transaction
            <ExternalLink aria-hidden="true" className="size-3.5" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </AlertDescription>
      <DismissButton onClick={onDismiss} />
    </Alert>
  );
};

export default BookingConfirmation;
