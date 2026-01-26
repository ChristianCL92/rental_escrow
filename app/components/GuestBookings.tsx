"use client"
import { getPriceByApartmentId } from "@/lib/properties"
import { format, addDays } from "date-fns";
import { CalendarCheck, CalendarDays, Moon, CheckCircle, Clock, Calendar, Delete } from "lucide-react";
import { EscrowInfo } from "@/hooks/useRentalProgram";

interface BookingProps {
    booking: EscrowInfo;
    
}

interface GuestBookingProps extends BookingProps {
  onCancel: (apartmentId:number) => void;
    isCanceling: boolean,
    cancelingId: number | null;
    cancelError: Error | null;
    
}

const StatusBadge = ({ booking }: BookingProps) => {
  const now = Date.now();
  
  if (booking.rentEnded) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
        <CheckCircle className="h-3 w-3" />
        Completed
      </span>
    );
  }
  
  if (booking.checkInDate.getTime() <= now) {
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

const GuestBookingCard = ({ booking, onCancel, isCanceling, cancelingId, cancelError }: GuestBookingProps) => {
  const pricePerNight = getPriceByApartmentId(booking.apartmentId);
  const nights = booking.amount / pricePerNight;
  const checkOutDate = addDays(booking.checkInDate, nights);
  const isThisOneCanceling = isCanceling && cancelingId === booking.apartmentId;
  const canCancel = booking.checkInDate.getTime() > Date.now(); 
  
  return (
    <div className="rounded-lg border p-4 transition-shadow hover:shadow-lg">
      <div className="flex justify-between items-start mb-3">
        <p className="font-semibold">Apartment #{booking.apartmentId}</p>
        <StatusBadge booking={booking} />
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          <span>Check-in: {format(booking.checkInDate, "MMM d, yyyy")}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4" />
          <span>Check-out: {format(checkOutDate, "MMM d, yyyy")}</span>
        </div>
        <div className="flex items-center gap-2">
          <Moon className="h-4 w-4" />
          <span>{nights} night{nights > 1 ? "s" : ""}</span>
        </div>
        {canCancel && (
          <div className="flex items-center gap-2">
            <Delete className="h-4 w-4"/>
          <button 
            onClick={() => onCancel(booking.apartmentId)}
            disabled={isThisOneCanceling}
            className="p-2 border rounded-lg text-sm font-bold hover:bg-red-100 
                 text-red-600 disabled:opacity-50 cursor-pointer"
            >
            {isThisOneCanceling ? "Canceling..." : "Cancel Booking"}
        </button>
    </div>  
   )}

    {cancelError && (
      <p className="text-red-500 text-sm mt-2">
        Failed to cancel: {cancelError.message}
     </p>
    )}
      </div>
      <div className="mt-3 pt-3 border-t flex justify-between items-center">
        <span className="text-sm text-muted-foreground">Total paid</span>
        <span className="text-lg font-bold text-primary">{booking.amount} USDC</span>
      </div>
    </div>
  );
};

export default GuestBookingCard;