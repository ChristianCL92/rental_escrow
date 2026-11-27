"use client";
import {
  getPriceByApartmentId,
  getPropertyNameByApartmentId,
} from "@/lib/properties";
import { formatUsdc } from "@/lib/money";
import { format, addDays } from "date-fns";
import {
  CalendarCheck,
  CalendarDays,
  Moon,
  CheckCircle,
  Clock,
  Calendar,
  Delete,
  Receipt,
} from "lucide-react";
import { EscrowInfo } from "@/hooks/useRentalProgram";
import { bookingPhase, checkInCalendarDate } from "@/lib/booking/escrow";
import { describeCancelError } from "@/lib/booking/errors";
import { explorerUrl } from "@/lib/solana/network";
import BookingErrorAlert from "./booking/BookingErrorAlert";

interface BookingProps {
  booking: EscrowInfo;
  now: number;
}

interface GuestBookingProps extends BookingProps {
  onCancel: (apartmentId: number, checkInDate: Date) => void;
  isCanceling: boolean;
  cancelingId: number | null;
  /** Only set on the card whose cancellation failed. */
  cancelError: Error | null;
  cancelReset: () => void;
}

const StatusBadge = ({ booking, now }: BookingProps) => {
  const phase = bookingPhase(booking, now);

  if (phase === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
        <CheckCircle className="h-3 w-3" />
        Completed
      </span>
    );
  }

  if (phase === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
        <Clock className="h-3 w-3" />
        Active
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
      <Calendar className="h-3 w-3" />
      Upcoming
    </span>
  );
};

const GuestBookingCard = ({
  booking,
  now,
  onCancel,
  isCanceling,
  cancelingId,
  cancelError,
  cancelReset,
}: GuestBookingProps) => {
  const pricePerNight = getPriceByApartmentId(booking.apartmentId);
  const nights = booking.amount / pricePerNight;
  const checkInDay = checkInCalendarDate(booking.checkInDate);
  const checkOutDate = addDays(checkInDay, nights);
  const isThisOneCanceling = isCanceling && cancelingId === booking.apartmentId;
  const canCancel = bookingPhase(booking, now) === "upcoming";

  return (
    <div className="rounded-lg border p-4 transition-shadow hover:shadow-lg">
      <div className="flex justify-between items-start mb-3">
        <p className="font-semibold">
          {getPropertyNameByApartmentId(booking.apartmentId)}
        </p>
        <StatusBadge booking={booking} now={now} />
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          <span>Check-in: {format(checkInDay, "MMM d, yyyy")}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4" />
          <span>Check-out: {format(checkOutDate, "MMM d, yyyy")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Moon className="h-4 w-4" />
          <span>
            {nights} night{nights > 1 ? "s" : ""}
          </span>
        </div>
        {booking.txSignature && (
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            <a
              href={explorerUrl("tx", booking.txSignature)}
              target="_blank"
              rel="noopener noreferrer"
            >
              View Transaction
            </a>
          </div>
        )}
        {canCancel && (
          <div className="flex items-center gap-2">
            <Delete className="h-4 w-4" />
            <button
              onClick={() => onCancel(booking.apartmentId, checkInDay)}
              disabled={isThisOneCanceling}
              className="p-2 border rounded-lg text-sm font-bold hover:bg-destructive/10 
                 text-destructive disabled:opacity-50 cursor-pointer"
            >
              {isThisOneCanceling ? "Canceling..." : "Cancel Booking"}
            </button>
          </div>
        )}

        {cancelError && (
          <BookingErrorAlert
            className="mt-4"
            error={describeCancelError(cancelError)}
            onDismiss={cancelReset}
          />
        )}
      </div>
      <div className="mt-3 pt-3 border-t flex justify-between items-center">
        <span className="text-sm text-muted-foreground">Total paid</span>
        <span className="text-lg font-bold text-foreground">
          {formatUsdc(booking.amount)}
        </span>
      </div>
    </div>
  );
};

export default GuestBookingCard;
