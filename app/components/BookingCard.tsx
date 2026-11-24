"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar } from "./ui/calendar";
import { Button } from "./ui/button";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { DateRange } from "react-day-picker";
import {
  differenceInDays,
  eachDayOfInterval,
  format,
  parseISO,
  startOfDay,
} from "date-fns";
import { CalendarX2, Loader2, Wallet } from "lucide-react";
import useRentalProgram, { SignedPayment } from "@/hooks/useRentalProgram";
import useBookingAPI, { SignedHold, toStay } from "@/hooks/useBookingAPI";
import {
  ActiveBookingError,
  BookingStage,
  DatesTakenError,
  describeBookingError,
  describeExpiredPayment,
  errorDetail,
  FriendlyError,
  MessageSigningUnsupportedError,
} from "@/lib/booking/errors";
import { lastBookableDay, MAX_NIGHTS } from "@/lib/booking/limits";
import { escrowCheckInTime, formatDeadline } from "@/lib/booking/escrow";
import { PaymentOutcome } from "@/lib/booking/settle";
import NetworkBadge from "./NetworkBadge";
import PaymentExplainer from "./booking/PaymentExplainer";
import BookingProgress, {
  ProgressStep,
  stepAnnouncement,
} from "./booking/BookingProgress";
import BookingErrorAlert from "./booking/BookingErrorAlert";
import BookingConfirmation, {
  ConfirmedBooking,
} from "./booking/BookingConfirmation";
import ErrorDetails from "./booking/ErrorDetails";
import WalletHelp from "./wallet/WalletHelp";

interface BookingProps {
  pricePerNight: number;
  apartmentId: number;
}

interface BookedDateRange {
  check_in_date: string;
  check_out_date: string;
}

const BookingCard = ({ pricePerNight, apartmentId }: BookingProps) => {
  const { connected, connecting, signMessage } = useWallet();
  const { setVisible } = useWalletModal();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [step, setStep] = useState<ProgressStep | null>(null);
  const [bookingError, setBookingError] = useState<FriendlyError | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);
  const {
    createEscrow,
    OWNER_ADDRESS,
    USDC_MINT,
    createEscrowTokenAccount,
    hasActiveBooking,
    settleSignedPayment,
  } = useRentalProgram();
  const {
    checkDatesAvailable,
    signReserve,
    createPending,
    confirmBooking,
    rollbackBooking,
    datesBooked,
  } = useBookingAPI();
  // The server refuses stays reaching past this day, so the calendar does
  // not offer them.
  const [lastDay] = useState(() => parseISO(lastBookableDay(Date.now())));

  const bookedDatesKey = ["booked-dates", apartmentId];
  const bookedDatesQuery = useQuery<{ bookings: BookedDateRange[] }>({
    queryKey: bookedDatesKey,
    queryFn: () => datesBooked(apartmentId),
    retry: 1,
  });

  const disabledDates = useMemo(
    () =>
      (bookedDatesQuery.data?.bookings ?? []).flatMap((booking) =>
        eachDayOfInterval({
          start: new Date(booking.check_in_date),
          end: new Date(booking.check_out_date),
        }).slice(0, -1),
      ),
    [bookedDatesQuery.data],
  );

  const { checkIn, checkOut, nights, totalPrice } = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) {
      return { checkIn: null, checkOut: null, nights: 0, totalPrice: 0 };
    }
    const nights = differenceInDays(dateRange.to, dateRange.from);

    return {
      nights,
      checkIn: dateRange.from,
      checkOut: dateRange.to,
      totalPrice: nights * pricePerNight,
    };
  }, [dateRange, pricePerNight]);

  const deadline =
    checkIn && nights > 0 ? formatDeadline(escrowCheckInTime(checkIn)) : null;
  const busy = step !== null && step !== "confirmed";

  const refreshBookedDates = () =>
    queryClient.invalidateQueries({ queryKey: bookedDatesKey });

  const handleBooking = async () => {
    if (!connected) {
      setVisible(true);
      return;
    }
    if (!checkIn || !checkOut || !deadline) return;

    setBookingError(null);
    setConfirmed(null);

    let stage: BookingStage = "signing";
    let hold: SignedHold | null = null;
    let txSignature: string | null = null;
    let signedPayment: SignedPayment | null = null;
    setStep("signing");

    try {
      if (!signMessage) {
        throw new MessageSigningUnsupportedError();
      }
      const stay = toStay({
        apartmentId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
      });

      if (await hasActiveBooking(apartmentId)) {
        throw new ActiveBookingError();
      }

      const { available } = await checkDatesAvailable({
        apartmentId,
        checkInDate: checkIn,
        checkOutDate: checkOut,
      });
      if (!available) {
        throw new DatesTakenError();
      }

      const auth = await signReserve(stay);

      stage = "reserving";
      setStep("reserving");
      hold = await createPending(stay, auth);

      stage = "account";
      setStep("account");
      await createEscrowTokenAccount(apartmentId);

      stage = "payment";
      setStep("payment");
      txSignature = await createEscrow({
        apartmentId: apartmentId,
        amount: totalPrice,
        checkInDate: checkIn,
        ownerAddress: OWNER_ADDRESS,
        usdcMint: USDC_MINT,
        onSigned: (payment) => {
          signedPayment = payment;
        },
      });
    } catch (error) {
      console.error("booking failed at stage", stage, error);
      let friendly = describeBookingError(error, {
        stage,
        totalUsdc: totalPrice,
      });
      const payment = signedPayment as SignedPayment | null;
      if (friendly.paymentMayHaveLanded) {
        let outcome: PaymentOutcome = "expired";
        if (payment) {
          setStep("confirming");
          outcome = await settleSignedPayment(apartmentId, payment);
        }
        if (outcome === "landed") {
          txSignature = payment!.signature;
        } else if (outcome === "expired") {
          friendly = describeExpiredPayment(friendly.detail);
        }
      }
      if (!txSignature) {
        setBookingError(friendly);
        setStep(null);
        if (hold && !friendly.paymentMayHaveLanded) {
          try {
            await rollbackBooking(hold);
          } catch (rollbackError) {
            console.error(
              "failed to release the pending booking",
              rollbackError,
            );
          }
        }
        if (friendly.action === "pick-dates") {
          void refreshBookedDates();
        }
        return;
      }
    }
    if (!txSignature) return;

    // The USDC is in escrow from here on, so the guest's booking stands even
    // if recording the signature fails: the server keeps a hold whose escrow
    // is on chain, and My Bookings reads the escrow from the chain.
    if (hold) {
      try {
        await confirmBooking(hold, txSignature);
      } catch (recordError) {
        console.error(
          "escrow funded but booking record not updated",
          recordError,
        );
      }
    }

    setConfirmed({
      checkIn,
      checkOut,
      nights,
      totalUsdc: totalPrice,
      deadline,
      txSignature,
    });
    setStep("confirmed");
    setDateRange(undefined);
    void refreshBookedDates();
  };

  const announcement = confirmed
    ? `Booking confirmed. ${confirmed.totalUsdc} USDC is held in escrow until check-in.`
    : step
      ? stepAnnouncement(step)
      : "";

  const buttonContent = !connected ? (
    connecting ? (
      "Connecting wallet..."
    ) : (
      <>
        <Wallet aria-hidden="true" />
        Connect wallet to pay
      </>
    )
  ) : busy ? (
    <>
      <Loader2 aria-hidden="true" className="animate-spin" />
      Booking in progress...
    </>
  ) : nights === 0 ? (
    "Select dates"
  ) : (
    `Book for ${totalPrice} USDC`
  );

  return (
    <div
      className="rounded-md border bg-white p-4 shadow-lg sm:p-6"
      data-testid="booking-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-xl font-semibold">Book your stay</h2>
        <NetworkBadge />
      </div>
      <p className="mt-2 text-muted-foreground">
        <span className="text-lg font-bold text-foreground">
          {pricePerNight} USDC
        </span>{" "}
        / night
      </p>
      {bookedDatesQuery.isError && (
        <Alert
          variant="warning"
          role="status"
          className="mt-4"
          data-testid="booked-dates-warning"
        >
          <CalendarX2 aria-hidden="true" />
          <AlertTitle className="line-clamp-none font-semibold">
            Some taken nights may not be shown
          </AlertTitle>
          <AlertDescription>
            <p>
              We couldn&apos;t load which nights are already booked, so the
              calendar may let you pick a taken night. We check your dates again
              before you pay.
            </p>
            <button
              type="button"
              onClick={() => void bookedDatesQuery.refetch()}
              disabled={bookedDatesQuery.isFetching}
              className="cursor-pointer font-semibold underline underline-offset-2 hover:decoration-2 disabled:cursor-wait disabled:opacity-70"
            >
              {bookedDatesQuery.isFetching ? "Trying again..." : "Try again"}
            </button>
            <ErrorDetails detail={errorDetail(bookedDatesQuery.error)} />
          </AlertDescription>
        </Alert>
      )}
      <div className="mt-4 flex justify-center">
        <Calendar
          mode="range"
          selected={dateRange}
          onSelect={setDateRange}
          numberOfMonths={2}
          className="rounded-lg border"
          disabled={
            busy
              ? true
              : [
                  (date) => date < startOfDay(new Date()),
                  { after: lastDay },
                  ...disabledDates,
                ]
          }
          max={MAX_NIGHTS}
          startMonth={new Date()}
          endMonth={lastDay}
        />
      </div>
      {nights > 0 && (
        <div className="mt-4 space-y-2 rounded-lg bg-slate-100 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Check-in</span>
            <span className="font-medium">
              {format(checkIn!, "MMM d, yyyy")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Check-out</span>
            <span className="font-medium">
              {format(checkOut!, "MMM d, yyyy")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {pricePerNight} USDC × {nights} night{nights > 1 ? "s" : ""}
            </span>
            <span className="font-medium">{totalPrice} USDC</span>
          </div>
        </div>
      )}
      <div className="mt-4 border-t pt-4">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Total</span>
          <span className="text-2xl font-bold">
            {nights > 0 ? `${totalPrice} USDC` : "-- USDC"}
          </span>
        </div>
        <p
          className="mt-1 text-right text-xs text-muted-foreground"
          data-testid="fee-note"
        >
          <span className="block">Plus a small network fee, paid in SOL.</span>
          <span className="block">1 USDC ≈ 1 US dollar.</span>
        </p>
      </div>
      <PaymentExplainer deadline={deadline} />
      {busy && step && <BookingProgress step={step} totalUsdc={totalPrice} />}
      {bookingError && (
        <BookingErrorAlert
          className="mt-4"
          error={bookingError}
          onDismiss={() => setBookingError(null)}
        />
      )}
      {confirmed && (
        <BookingConfirmation
          booking={confirmed}
          onDismiss={() => {
            setConfirmed(null);
            setStep(null);
          }}
        />
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <Button
        className="mt-4 w-full cursor-pointer"
        size="lg"
        disabled={connected ? nights === 0 || busy : connecting}
        onClick={handleBooking}
      >
        {buttonContent}
      </Button>
      {!connected && <WalletHelp className="mt-3 text-center" />}
    </div>
  );
};

export default BookingCard;
