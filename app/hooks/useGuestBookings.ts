import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import useRentalProgram, { EscrowInfo } from "./useRentalProgram";
import useNow from "./useNow";
import { formatDate } from "./useBookingAPI";
import { bookingPhase } from "@/lib/booking/escrow";
import { ApiError } from "@/lib/booking/errors";
import type { SignedAuth } from "@/lib/booking/auth-message";
import { signBookingAction } from "@/lib/booking/signing";

interface GuestBookingRecord {
  apartment_id: number;
  check_in_date: string;
  tx_signature: string | null;
}

/** A short-lived My Bookings sign-in, from one signed "view" message. */
interface BookingsSession {
  token: string;
  expiresAt: string;
}

export interface CancelParams {
  apartmentId: number;
  /** The guest's check-in calendar day. */
  checkInDate: Date;
}

export interface CancelResult {
  txSignature: string;
  apartmentId: number;
  checkInDate: string;
  /** The guest's signed cancel, for recording it once the refund is done. */
  auth: SignedAuth;
}

/** Sessions end a minute early so a request never races the expiry. */
const EXPIRY_MARGIN_MS = 60_000;

const storageKey = (wallet: string) => `el-solar:bookings-session:${wallet}`;

const readStoredSession = (wallet: string): BookingsSession | null => {
  try {
    const raw = window.sessionStorage.getItem(storageKey(wallet));
    return raw ? (JSON.parse(raw) as BookingsSession) : null;
  } catch {
    return null;
  }
};

const writeStoredSession = (
  wallet: string,
  session: BookingsSession | null,
) => {
  try {
    if (session) {
      window.sessionStorage.setItem(
        storageKey(wallet),
        JSON.stringify(session),
      );
    } else {
      window.sessionStorage.removeItem(storageKey(wallet));
    }
  } catch {
    // Without storage the session lasts until the page reloads.
  }
};

/** The guest's session expired or was refused; sign in again. */
class SessionExpiredError extends Error {
  constructor() {
    super("Your sign-in expired. Please sign again.");
    this.name = "SessionExpiredError";
  }
}

const useGuestBookings = () => {
  const { publicKey, signMessage } = useWallet();
  const { fromUSDCAmount, program, cancelBooking } = useRentalProgram();

  const queryClient = useQueryClient();
  const now = useNow();
  const wallet = publicKey?.toBase58() ?? null;

  // Sessions signed in this tab, by wallet; `null` marks one that ended.
  const [sessions, setSessions] = useState<
    Record<string, BookingsSession | null>
  >({});
  const saveSession = useCallback(
    (owner: string, session: BookingsSession | null) => {
      writeStoredSession(owner, session);
      setSessions((current) => ({ ...current, [owner]: session }));
    },
    [],
  );
  const stored = wallet
    ? wallet in sessions
      ? sessions[wallet]
      : typeof window === "undefined"
        ? null
        : readStoredSession(wallet)
    : null;
  const session =
    stored && Date.parse(stored.expiresAt) - EXPIRY_MARGIN_MS > now
      ? stored
      : null;

  const signInMutation = useMutation({
    mutationFn: async (): Promise<{
      wallet: string;
      session: BookingsSession;
    }> => {
      const auth = await signBookingAction(signMessage, publicKey, "view");
      const response = await fetch("/api/bookings/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auth }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new ApiError(
          body?.error || body?.text || "Could not sign in",
          response.status,
        );
      }
      return {
        wallet: auth.wallet,
        session: { token: body.token, expiresAt: body.expiresAt },
      };
    },
    onSuccess: ({ wallet: owner, session: signed }) =>
      saveSession(owner, signed),
  });

  const bookingsQuery = useQuery<EscrowInfo[]>({
    queryKey: ["guest-booking", wallet, session?.token],

    queryFn: async () => {
      if (!program || !publicKey || !session) {
        throw new Error("Wallet not identified");
      }

      const accounts = await program.account.escrowAccount.all();

      const date = Date.now();

      const findSignature = await fetch("/api/bookings/guest", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (findSignature.status === 401) {
        saveSession(publicKey.toBase58(), null);
        throw new SessionExpiredError();
      }
      if (!findSignature.ok) {
        throw new ApiError(
          "Could not load your bookings",
          findSignature.status,
        );
      }

      const { bookings: dbBookings } = await findSignature.json();

      return accounts
        .filter((account) => account.account.guestAddress.equals(publicKey))
        .map((account) => {
          const data = account.account;
          const checkInDate = new Date(data.rentTime.toNumber() * 1000);

          const match = dbBookings?.find(
            (b: GuestBookingRecord) =>
              b.apartment_id === data.apartmentId.toNumber() &&
              new Date(b.check_in_date).getTime() === checkInDate.getTime(),
          );

          return {
            publicKey: account.publicKey,
            apartmentId: data.apartmentId.toNumber(),
            amount: fromUSDCAmount(data.amount),
            ownerAddress: new PublicKey(data.ownerAddress),
            guestAddress: new PublicKey(data.guestAddress),
            checkInDate,
            rentStarted: data.rentStarted,
            rentEnded: data.rentEnded,
            canRelease: checkInDate.getTime() < date,
            txSignature: match?.tx_signature ?? null,
          };
        })
        .sort((a, b) => b.checkInDate.getTime() - a.checkInDate.getTime());
    },
    enabled: !!publicKey && !!program && !!session,

    staleTime: 30 * 1000,

    retry: (failureCount, error) => {
      if (
        error instanceof Error &&
        (error.message === "Wallet not identified" ||
          error instanceof SessionExpiredError)
      ) {
        return false;
      }
      return failureCount < 3;
    },

    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  /**
   * Signs the cancel first, so a guest who refuses the signature changes
   * nothing, then refunds the escrow on chain.
   */
  const mutation = useMutation({
    mutationFn: async ({
      apartmentId,
      checkInDate,
    }: CancelParams): Promise<CancelResult> => {
      const day = formatDate(checkInDate);
      const auth = await signBookingAction(signMessage, publicKey, "cancel", {
        apartmentId,
        checkInDate: day,
      });
      const txSignature = await cancelBooking({ apartmentId });
      return { txSignature, apartmentId, checkInDate: day, auth };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guest-booking"] });
    },
  });

  const bookings = bookingsQuery.data ?? [];
  const inPhase = (phase: ReturnType<typeof bookingPhase>) =>
    bookings.filter((b) => bookingPhase(b, now) === phase);

  return {
    now,
    bookings,
    isLoading: bookingsQuery.isLoading,
    isError: bookingsQuery.isError,
    error: bookingsQuery.error,
    refetch: bookingsQuery.refetch,

    /** The wallet is connected but has not signed in to My Bookings. */
    needsSignIn: !!publicKey && !session,
    signIn: signInMutation.mutate,
    isSigningIn: signInMutation.isPending,
    signInError: signInMutation.error,
    signInReset: signInMutation.reset,

    hasBookings: bookings.length > 0,
    activeBookings: inPhase("active"),
    completedBookings: inPhase("completed"),
    upcomingBookings: inPhase("upcoming"),

    cancelBookingMutation: mutation.mutate,
    cancelError: mutation.error,
    isCanceling: mutation.isPending,
    cancelReset: mutation.reset,
  };
};

export default useGuestBookings;
