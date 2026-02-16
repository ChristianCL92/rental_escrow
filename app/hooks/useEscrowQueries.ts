import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import useRentalProgram, {
  EscrowInfo,
  ReleasePaymentParams,
} from "./useRentalProgram";
import { PublicKey } from "@solana/web3.js";

const useEscrowQueries = () => {
  const queryClient = useQueryClient();
  const { releasePayment, program, isOwner, fromUSDCAmount } =
    useRentalProgram();

  const escrowsQuery = useQuery<EscrowInfo[]>({
    queryKey: ["escrows"],
    queryFn: async () => {
      if (!program) {
        throw new Error("Program not initialized");
      }

      const accounts = await program?.account.escrowAccount.all();

      const now = Date.now();

      return accounts.map((account) => {
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
          canRelease: !data.rentEnded && checkInDate.getTime() <= now,
        };
      });
    },
    enabled: !!program && isOwner,
    staleTime: 30 * 1000,
    retry: (failureCount, error) => {
      if (
        error instanceof Error &&
        error.message === "Program not initialized"
      ) {
        return false;
      }
      return failureCount < 3;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  const releaseMutation = useMutation({
    mutationFn: (params: ReleasePaymentParams) => releasePayment(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escrows"] });
    },
  });

  return {
    escrows: escrowsQuery.data ?? [],
    isLoading: escrowsQuery.isLoading,
    isError: escrowsQuery.isError,
    error: escrowsQuery.error,
    refetch: escrowsQuery.refetch,

    releasePayment: releaseMutation.mutate,
    isReleasing: releaseMutation.isPending,
    releaseError: releaseMutation.error,
  };
};

export default useEscrowQueries;
