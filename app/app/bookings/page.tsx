"use client"
import { Loader2, Wallet } from "lucide-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import useGuestBookings from "@/hooks/useGuestBookings";
import GuestBookings from "@/components/GuestBookings";
import { useState } from "react";
import useBookingAPI from "@/hooks/useBookingAPI";


export const GuestPage = () => {
    const {
            bookings,
            refetch,
            isLoading,
            error,
            isError,
            hasBookings,
            activeBookings,
            completedBookings,
            upcomingBookings,
            cancelBookingMutation,
            cancelError,
            isCanceling
          } = useGuestBookings();

    const  { connected} = useWallet();
    const [ cancelId, setCancelId ] = useState<number | null>(null);
    const {  findBookingId, updateBooking  } = useBookingAPI();

    const handleCancelation = async(apartmentId: number, checkInDate: Date ) => {
          setCancelId(apartmentId);
          cancelBookingMutation(
            { apartmentId },
            
            {
              onSettled: () => {
                setCancelId(null);
              }
            }
          )
          const {booking} = await findBookingId(apartmentId, checkInDate)
          await updateBooking( booking.id , "cancelled");

}

if (!connected) {
    return (
      <main className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <Wallet className="h-8 w-8 text-slate-600" />
          </div>
          <h1 className="text-2xl font-bold">My Bookings</h1>
          <p className="mt-2 text-muted-foreground">
            Connect your wallet to view your booking history
          </p>
          <div className="mt-6 flex justify-center">
            <WalletMultiButton />
          </div>
        </div>  
      </main>
    );
  }

   if (isLoading) {
    return (
      <main className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-md text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-600" />
          <p className="mt-4 text-muted-foreground">Loading your bookings...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto p-6">
      <div className="mt-2 flex justify-between">
        <div>
          <div>
            <p className="font-bold text-lg">Booking history</p>
          </div>
         {bookings.length === 1
          ? (<p className="font-bold text-lg text-muted-foreground">{bookings.length} booking</p>)
          : (bookings.length > 1 
          ? (<p className="font-bold text-lg text-muted-foreground">{bookings.length} bookings</p>) 
          : (<p className="font-bold text-lg text-muted-foreground">No bookings yet</p>))
          }
        </div>
        <div className="flex gap-2">
            <div>
          <Button 
          onClick={() => refetch()}
          className="cursor-pointer"
          >
            Refetch
          </Button>
            </div>
            <div>
          <Link 
          href={"/"}
          >
            <Button className="cursor-pointer" >
              Back to properties
             </Button>
          </Link>
        </div>
        </div>
      </div>
          {hasBookings && (
          <div className="grid grid-cols-3 gap-4 mt-6">
           <div className="rounded-lg bg-amber-50 p-3 text-center">
              <p className="text-2xl font-bold text-amber-700">{upcomingBookings.length}</p>
              <p className="text-sm text-amber-600">Upcoming</p>
           </div>
          <div className="rounded-lg bg-blue-50 p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{activeBookings.length}</p>
              <p className="text-sm text-blue-600">Active</p>
          </div>
          <div className="rounded-lg bg-green-50 p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{completedBookings.length}</p>
              <p className="text-sm text-green-600">Completed</p>
          </div>
        </div>
          )}
          {isError && (
            <div className="mt-4 p-4 bg-red-100 border border-red-400 rounded-lg">
              {error instanceof Error ? error.message : "Failed to load bookings"}
            </div>
          )} 
      <div className="grid gap-4 md:grid-cols-2 mt-6">
      {bookings.map((booking) => {
        return(
          <GuestBookings 
          key={booking.publicKey.toBase58()} 
          booking={booking}
          isCanceling={isCanceling}
          onCancel={handleCancelation}
          cancelingId={cancelId}
          cancelError={cancelError}
          />
        )}
        )}
      </div>
    </main>
  )
}

export default GuestPage;