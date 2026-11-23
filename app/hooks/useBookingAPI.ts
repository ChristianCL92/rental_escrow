import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useState } from "react";
import { format } from "date-fns";
import { ApiError } from "@/lib/booking/errors";
import type { SignedAuth } from "@/lib/booking/auth-message";
import type { Stay } from "@/lib/booking/limits";
import { signBookingAction } from "@/lib/booking/signing";

interface AvailabilityParams {
  apartmentId: number;
  checkInDate: Date;
  checkOutDate: Date;
}

/** A hold and the reserve signature that created it. */
export interface SignedHold {
  bookingId: string;
  stay: Stay;
  auth: SignedAuth;
}

/** A guest's calendar day as the API sends it, "yyyy-MM-dd". */
export const formatDate = (date: Date): string => {
  return format(date, "yyyy-MM-dd");
};

export const toStay = ({
  apartmentId,
  checkInDate,
  checkOutDate,
}: AvailabilityParams): Stay => ({
  apartmentId,
  checkInDate: formatDate(checkInDate),
  checkOutDate: formatDate(checkOutDate),
});

const sendJson = (method: string, body: unknown) =>
  fetch("/api/bookings", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * Builds an ApiError from a failed response. The routes answer with
 * `{ error }` (and the rate limiter with `{ text }`); the body may also not be
 * JSON at all when a proxy or the dev server fails first.
 */
const apiError = async (
  response: Response,
  fallback: string,
): Promise<ApiError> => {
  let message = fallback;
  try {
    const body = await response.json();
    message = body?.error || body?.message || body?.text || fallback;
  } catch {
    // keep the fallback
  }
  return new ApiError(message, response.status);
};

const useBookingAPI = () => {
  const [isChecking, setIsChecking] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRollback, setIsRollback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { publicKey, signMessage } = useWallet();

  const datesBooked = useCallback(async (apartmentId: number) => {
    try {
      const params = new URLSearchParams({
        apartmentId: apartmentId.toString(),
      });

      const respons = await fetch(`/api/bookings/booked-dates?${params}`);

      if (!respons.ok) {
        throw await apiError(respons, "dates booked not found");
      }
      return await respons.json();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "failed to get booked dates";
      setError(message);
      throw error;
    }
  }, []);

  const checkDatesAvailable = useCallback(
    async ({ apartmentId, checkInDate, checkOutDate }: AvailabilityParams) => {
      setIsChecking(true);
      setError(null);

      try {
        const response = await fetch("/api/bookings/availability", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            apartmentId,
            checkInDate: formatDate(checkInDate),
            checkOutDate: formatDate(checkOutDate),
          }),
        });

        if (!response.ok) {
          throw await apiError(response, "Failed to check availability");
        }

        return await response.json();
      } catch (error) {
        console.error("Encountered error when processing data:", error);
        const message =
          error instanceof Error
            ? error.message
            : "Failed to check availability";
        setError(message);
        throw error;
      } finally {
        setIsChecking(false);
      }
    },
    [],
  );

  /**
   * Asks the wallet to sign the free "hold these nights" message. The same
   * signature later confirms or releases that one hold.
   */
  const signReserve = useCallback(
    (stay: Stay): Promise<SignedAuth> =>
      signBookingAction(signMessage, publicKey, "reserve", stay),
    [signMessage, publicKey],
  );

  const createPending = useCallback(
    async (stay: Stay, auth: SignedAuth): Promise<SignedHold> => {
      setIsCreating(true);
      setError(null);

      try {
        const response = await sendJson("POST", { ...stay, auth });

        if (!response.ok) {
          throw await apiError(response, "Failed to create booking");
        }

        const { booking } = await response.json();
        return { bookingId: booking.id, stay, auth };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to create pending booking";
        setError(message);
        throw error;
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  /** Records the payment; the server checks it on chain. */
  const confirmBooking = useCallback(
    async ({ bookingId, stay, auth }: SignedHold, txSignature: string) => {
      setIsConfirming(true);
      setError(null);
      try {
        const response = await sendJson("PATCH", {
          bookingId,
          status: "confirmed",
          txSignature,
          ...stay,
          auth,
        });

        if (!response.ok) {
          throw await apiError(response, "Could not confirm booking");
        }

        return await response.json();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to confirm booking";
        setError(message);
        throw error;
      } finally {
        setIsConfirming(false);
      }
    },
    [],
  );

  /**
   * Marks a refunded booking cancelled. `auth` is the guest's signed cancel
   * for this room and check-in day; the server checks the escrow is closed.
   */
  const cancelRecord = useCallback(
    async (apartmentId: number, checkInDate: string, auth: SignedAuth) => {
      const response = await sendJson("PATCH", {
        status: "cancelled",
        apartmentId,
        checkInDate,
        auth,
      });
      if (!response.ok) {
        throw await apiError(response, "Could not cancel booking");
      }
      return await response.json();
    },
    [],
  );

  /** Releases the guest's own unpaid hold. */
  const rollbackBooking = useCallback(
    async ({ bookingId, stay, auth }: SignedHold) => {
      setIsRollback(true);
      try {
        const response = await sendJson("DELETE", { bookingId, ...stay, auth });

        if (!response.ok) {
          console.error("Failed to execute Rollback");
          throw await apiError(response, "Could not rollback booking");
        }

        return await response.json();
      } catch (error) {
        console.error("Rollback failed:", error);
        const message =
          error instanceof Error ? error.message : "Failed to rollback booking";
        setError(message);
        throw error;
      } finally {
        setIsRollback(false);
      }
    },
    [],
  );

  return {
    checkDatesAvailable,
    isChecking,
    error,
    signReserve,
    createPending,
    isCreating,
    confirmBooking,
    cancelRecord,
    isConfirming,
    rollbackBooking,
    isRollback,
    datesBooked,
  };
};

export default useBookingAPI;
