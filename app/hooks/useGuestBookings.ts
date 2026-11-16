import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import useRentalProgram, {
  CancelBookingParams,
  EscrowInfo,
} from "./useRentalProgram";
import useNow from "./useNow";
import { bookingPhase } from "@/lib/booking/escrow";

interface GuestBookingRecord {
  apartment_id: number;
  check_in_date: string;
  tx_signature: string | null;
}

const useGuestBookings = () => {
  const { publicKey } = useWallet();
  const { fromUSDCAmount, program, cancelBooking } = useRentalProgram();

  const queryClient = useQueryClient();
  const now = useNow();
  const bookingsQuery = useQuery<EscrowInfo[]>({
    queryKey: ["guest-booking", publicKey?.toBase58()],

    queryFn: async () => {
      if (!program || !publicKey) {
        throw new Error("Wallet not identified");
      }

      const accounts = await program.account.escrowAccount.all();

      const date = Date.now();

      const params = new URLSearchParams({
        wallet: publicKey.toBase58(),
      });
      const findSignature = await fetch(`/api/bookings/guest?${params}`);

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
    enabled: !!publicKey && !!program,

    staleTime: 30 * 1000,

    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === "Wallet not identified") {
        return false;
      }
      return failureCount < 3;
    },

    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  const mutation = useMutation({
    mutationFn: (params: CancelBookingParams) => cancelBooking(params),
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
