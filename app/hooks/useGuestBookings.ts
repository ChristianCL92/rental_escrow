import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import useRentalProgram, {
  CancelBookingParams,
  EscrowInfo,
} from "./useRentalProgram";

const useGuestBookings = () => {
  const { publicKey } = useWallet();
  const { fromUSDCAmount, program, cancelBooking } = useRentalProgram();

  const queryClient = useQueryClient();
  const bookingsQuery = useQuery<EscrowInfo[]>({
    queryKey: ["guest-booking", publicKey?.toBase58()],

    queryFn: async () => {
      if (!program || !publicKey) {
        throw new Error("Wallet not identified");
      }

      const accounts = await program.account.escrowAccount.all();

      const date = Date.now();

      return accounts
        .filter((account) => account.account.guestAddress.equals(publicKey))
        .map((account) => {
          const data = account.account;
          const checkInDate = new Date(data.rentTime.toNumber() * 1000);

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

  return {
    bookings: bookingsQuery.data ?? [],
    isLoading: bookingsQuery.isLoading,
    isError: bookingsQuery.isError,
    error: bookingsQuery.error,
    refetch: bookingsQuery.refetch,

    hasBookings: (bookingsQuery.data?.length ?? 0) > 0,
    activeBookings:
      bookingsQuery.data?.filter(
        (b) => !b.rentEnded && b.checkInDate.getTime() <= Date.now(),
      ) ?? [],
    completedBookings: bookingsQuery.data?.filter((b) => b.rentEnded) ?? [],
    upcomingBookings:
      bookingsQuery.data?.filter(
        (b) => !b.rentEnded && b.checkInDate.getTime() > Date.now(),
      ) ?? [],

    cancelBookingMutation: mutation.mutate,
    cancelError: mutation.error,
    isCanceling: mutation.isPending,
  };
};

export default useGuestBookings;
