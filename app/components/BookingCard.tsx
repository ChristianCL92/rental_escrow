"use client"

import { useState, useMemo } from "react";
import { Calendar } from "./ui/calendar";
import { Button } from "./ui/button";
import { useWallet } from "@solana/wallet-adapter-react";
import { DateRange } from "react-day-picker";
import { differenceInDays, format } from "date-fns";
import useRentalProgram from "@/hooks/useRentalProgram";

interface BookingProps {
  pricePerNight: number,
  apartmentId: number
}

 const BookingCard = ({pricePerNight, apartmentId}: BookingProps) => {
    const {connected} = useWallet()
    const [loading, setLoading] = useState(false);
    const [dateRange, setDateRange] = useState<DateRange | undefined>(); 
    const [bookingSuccess, setBookingSuccess] = useState<string | null>(null)
    const { createEscrow, OWNER_ADDRESS, USDC_MINT, createEscrowTokenAccount } = useRentalProgram();

    const {checkIn, checkOut, nights, totalPrice} = useMemo(() => {
      if (!dateRange?.from || !dateRange?.to) {
          return {checkIn: null, checkOut: null, nights: 0, totalPrice: 0};
      }
      const nights = differenceInDays(dateRange.to, dateRange.from)

      return {
        nights,
        checkIn: dateRange.from,
        checkOut: dateRange.to,
        totalPrice: nights * pricePerNight
      }

    }, [dateRange, pricePerNight])

    const handleBooking = async () => {
      if (!checkIn || !checkOut) return;
      setLoading(true);
        try {
          await createEscrowTokenAccount(apartmentId)
          
          const txSignature = await createEscrow({
            apartmentId: apartmentId,
            amount: totalPrice,
            checkInDate: checkIn,
            ownerAddress: OWNER_ADDRESS,
            usdcMint: USDC_MINT
          })
          setBookingSuccess(txSignature);
          console.log("Booking successful! Transaction signature:", txSignature);
        } catch (error) {
          console.error("Booking failed:", error);
        } finally {
          setLoading(false);
        }
      
    }
    
    return (
      <div className="rounded-md border bg-white p-6 shadow-lg">
        <h2 className="text-xl font-semibold">Book your stay</h2>
        <p className="mt-2 text-muted-foreground">
          <span className="text-lg font-bold text-foreground">{pricePerNight}USDC</span>
          {" "}/ night
          </p>
        <div className="mt-4 flex justify-center">
        <Calendar
          mode="range"
          selected={dateRange}
          onSelect={setDateRange}
          numberOfMonths={1}
          className="rounded-lg border"
          startMonth={new Date()}
        />
      </div>
       { nights > 0 && ( 
         <div className="mt-4 space-y-2 rounded-lg bg-slate-100 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Check-in</span>
          <span className="font-medium">{format(checkIn!, "MMM d, yyyy")}</span>
        </div>
        <div className="flex justify-between">
            <span className="text-muted-foreground">Check-out</span>
            <span className="font-medium">{format(checkOut!, "MMM d, yyyy")}</span>
        </div>
         <div className="flex justify-between">
            <span className="text-muted-foreground">
              {pricePerNight} USDC × {nights} nights
            </span>
            <span className="font-medium">{totalPrice} USDC</span>
          </div>
      </div>
      )}
       {bookingSuccess && (
      <div className="mt-4 p-4 bg-green-100 border border-green-400 rounded-lg">
       <p className="font-semibold text-green-800">Booking Confirmed!</p>
        <a href={`https://explorer.solana.com/tx/${bookingSuccess}?cluster=devnet`} 
       target="_blank" 
       className="text-sm text-green-600 underline">
      View transaction
        </a>
     </div>
)}
        <div className="mt-4 flex items-center justify-between border-t pt-4">
        <span className="font-semibold">Total</span>
        <span className="text-2xl font-bold">{nights > 0 ? `${totalPrice} USDC` : "-- USDC"}</span>
      </div>
      <Button
        className="mt-4 w-full"
        size="lg"
        disabled={!connected || nights === 0 || loading}
        onClick={handleBooking}
      >
        {!connected
          ? "Connect Wallet to Book"
          : nights === 0
          ? "Select Dates"
          : loading 
          ? "Processing..." 
          : `Book for ${totalPrice} USDC`}
      </Button>
      {!connected && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Connect your wallet to make a booking
        </p>
      )}
      </div>
  )
}

export default BookingCard;
