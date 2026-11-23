"use client";
import { CircleAlert, Loader2, ShieldCheck, Wallet } from "lucide-react";
import LoadingBookingSkeleton from "./loading";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import useGuestBookings from "@/hooks/useGuestBookings";
import GuestBookings from "@/components/GuestBookings";
import { useState } from "react";
import useBookingAPI from "@/hooks/useBookingAPI";
import { IoMdArrowBack } from "react-icons/io";
import ConnectWalletButton from "@/components/wallet/ConnectWalletButton";
import WalletHelp from "@/components/wallet/WalletHelp";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import ErrorDetails from "@/components/booking/ErrorDetails";
import BookingErrorAlert from "@/components/booking/BookingErrorAlert";
import { describeSignInError, errorDetail } from "@/lib/booking/errors";
import { SESSION_TTL_MS } from "@/lib/booking/auth-message";

export const GuestPage = () => {
  const {
    now,
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
    isCanceling,
    cancelReset,
    needsSignIn,
    signIn,
    isSigningIn,
    signInError,
    signInReset,
  } = useGuestBookings();

  const { connected } = useWallet();
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [failedCancelId, setFailedCancelId] = useState<number | null>(null);
  const { cancelRecord } = useBookingAPI();

  const handleCancelation = (apartmentId: number, checkInDate: Date) => {
    setCancelId(apartmentId);
    setFailedCancelId(null);
    cancelBookingMutation(
      { apartmentId, checkInDate },
      {
        // Free the dates only once the refund went through on-chain; a
        // refused signature, or a rejected or failed cancel, leaves the
        // booking and its dates held.
        onSuccess: async (result) => {
          try {
            await cancelRecord(
              result.apartmentId,
              result.checkInDate,
              result.auth,
            );
          } catch (recordError) {
            console.error(
              "refund done but booking record not updated",
              recordError,
            );
          }
        },
        onError: () => setFailedCancelId(apartmentId),
        onSettled: () => setCancelId(null),
      },
    );
  };

  if (!connected) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href="/" aria-label="Back to properties">
              <IoMdArrowBack aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <Wallet className="h-8 w-8 text-slate-600" />
          </div>
          <h1 className="text-2xl font-bold">My Bookings</h1>
          <p className="mt-2 text-muted-foreground">
            Connect your wallet to view your booking history
          </p>
          <div className="mt-6 flex justify-center">
            <ConnectWalletButton size="lg" />
          </div>
          <WalletHelp className="mt-4" />
        </div>
      </div>
    );
  }

  if (needsSignIn) {
    return (
      <div className="container mx-auto px-4 py-16">
        <div>
          <Button asChild variant="outline" size="sm">
            <Link href="/" aria-label="Back to properties">
              <IoMdArrowBack aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
            <ShieldCheck
              aria-hidden="true"
              className="h-8 w-8 text-slate-600"
            />
          </div>
          <h1 className="text-2xl font-bold">My Bookings</h1>
          <p className="mt-2 text-muted-foreground">
            Sign a short message with your wallet to show your bookings. Signing
            is free and is not a transaction. You stay signed in for{" "}
            {SESSION_TTL_MS / 60_000} minutes.
          </p>
          <div className="mt-6 flex justify-center">
            <Button
              size="lg"
              className="cursor-pointer"
              disabled={isSigningIn}
              onClick={() => signIn()}
            >
              {isSigningIn ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" />
                  Waiting for your wallet...
                </>
              ) : (
                "Sign in with wallet"
              )}
            </Button>
          </div>
          {signInError && (
            <BookingErrorAlert
              className="mt-6 text-left"
              error={describeSignInError(signInError)}
              onDismiss={signInReset}
            />
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div>
        <LoadingBookingSkeleton />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mt-2 flex justify-between">
        <div>
          <h1 className="font-bold text-lg">Booking history</h1>
          {bookings.length === 1 ? (
            <p className="font-bold text-lg text-muted-foreground">
              {bookings.length} booking
            </p>
          ) : bookings.length > 1 ? (
            <p className="font-bold text-lg text-muted-foreground">
              {bookings.length} bookings
            </p>
          ) : (
            <p className="font-bold text-lg text-muted-foreground">
              No bookings yet
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <div>
            <Button onClick={() => refetch()} className="cursor-pointer">
              Refetch
            </Button>
          </div>
          <div>
            <Button asChild>
              <Link href="/">Back to properties</Link>
            </Button>
          </div>
        </div>
      </div>
      {hasBookings && (
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="rounded-lg bg-amber-50 p-3 text-center">
            <p className="text-2xl font-bold text-amber-700">
              {upcomingBookings.length}
            </p>
            <p className="text-sm text-amber-600">Upcoming</p>
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">
              {activeBookings.length}
            </p>
            <p className="text-sm text-blue-600">Active</p>
          </div>
          <div className="rounded-lg bg-green-50 p-3 text-center">
            <p className="text-2xl font-bold text-green-700">
              {completedBookings.length}
            </p>
            <p className="text-sm text-green-600">Completed</p>
          </div>
        </div>
      )}
      {isError && (
        <Alert variant="destructive" className="mt-4">
          <CircleAlert aria-hidden="true" />
          <AlertTitle className="line-clamp-none font-semibold">
            We couldn&apos;t load your bookings
          </AlertTitle>
          <AlertDescription>
            <p>
              Your bookings are safe on the Solana network. Try again in a
              moment.
            </p>
            <ErrorDetails detail={errorDetail(error)} />
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2 mt-6">
        {bookings.map((booking) => {
          return (
            <GuestBookings
              key={booking.publicKey.toBase58()}
              booking={booking}
              now={now}
              isCanceling={isCanceling}
              onCancel={handleCancelation}
              cancelingId={cancelId}
              cancelError={
                failedCancelId === booking.apartmentId ? cancelError : null
              }
              cancelReset={cancelReset}
            />
          );
        })}
      </div>
    </div>
  );
};

export default GuestPage;
