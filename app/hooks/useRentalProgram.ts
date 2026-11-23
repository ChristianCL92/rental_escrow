"use client";

import { useMemo, useCallback } from "react";
import {
  useWallet,
  useConnection,
  useAnchorWallet,
} from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, BN, utils } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import idl from "@/lib/idl/rental_escrow.json";
import { RentalEscrow } from "@/lib/types/rental_escrow";
import { escrowRentTime, USDC_DECIMALS } from "@/lib/booking/escrow";
import { PaymentOutcome, settlePayment } from "@/lib/booking/settle";
import { escrowAddress } from "@/lib/solana/escrow-account";

export const OWNER_ADDRESS = new PublicKey(
  process.env.NEXT_PUBLIC_OWNER_ADDRESS!,
);

export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS!,
);

export interface CreateEscrowParams {
  apartmentId: number;
  amount: number;
  checkInDate: Date;
  ownerAddress: PublicKey;
  usdcMint: PublicKey;
  /** Called once the payment is signed, before it is sent. */
  onSigned?: (payment: SignedPayment) => void;
}

export interface SignedPayment {
  signature: string;
  lastValidBlockHeight: number;
}

export interface ReleasePaymentParams {
  apartmentId: number;
  guestAddress: PublicKey;
}

export interface CancelBookingParams {
  apartmentId: number;
}

export interface EscrowInfo {
  publicKey: PublicKey;
  apartmentId: number;
  amount: number;
  ownerAddress: PublicKey;
  guestAddress: PublicKey;
  checkInDate: Date;
  rentStarted: boolean;
  rentEnded: boolean;
  canRelease: boolean;
  txSignature?: string;
}

const useRentalProgram = () => {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey, connected } = useWallet();

  const program = useMemo(() => {
    if (!wallet || !connected) return;

    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    return new Program<RentalEscrow>(idl as RentalEscrow, provider);
  }, [connection, wallet, connected]);

  const toUSDCAmount = useCallback((amount: number) => {
    return amount * Math.pow(10, USDC_DECIMALS);
  }, []);

  const fromUSDCAmount = useCallback((amount: BN) => {
    return amount.toNumber() / Math.pow(10, USDC_DECIMALS);
  }, []);

  const getEscrowPDA = useCallback(
    (apartmentId: number): PublicKey | null =>
      publicKey ? escrowAddress(publicKey, apartmentId) : null,
    [publicKey],
  );

  const getPdaGuest = useCallback(
    (guestAddress: PublicKey, apartmentId: number): PublicKey =>
      escrowAddress(guestAddress, apartmentId),
    [],
  );

  /**
   * True when this wallet already has an escrow for the room. The program
   * derives the escrow from [guest, apartment], so a second booking of the
   * same room would fail on-chain until the first is cancelled or released.
   */
  const hasActiveBooking = useCallback(
    async (apartmentId: number): Promise<boolean> => {
      const escrowPDA = getEscrowPDA(apartmentId);
      if (!escrowPDA) {
        throw new Error("Wallet not connected");
      }
      const account = await connection.getAccountInfo(escrowPDA);
      return account !== null;
    },
    [connection, getEscrowPDA],
  );

  /**
   * Waits, bounded, until a signed payment either created the escrow or can
   * no longer land because its blockhash expired.
   */
  const settleSignedPayment = useCallback(
    (
      apartmentId: number,
      { lastValidBlockHeight }: SignedPayment,
    ): Promise<PaymentOutcome> =>
      settlePayment(lastValidBlockHeight, {
        blockHeight: () => connection.getBlockHeight("confirmed"),
        escrowExists: () => hasActiveBooking(apartmentId),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      }),
    [connection, hasActiveBooking],
  );

  const createEscrow = useCallback(
    async ({
      amount,
      apartmentId,
      checkInDate,
      ownerAddress,
      usdcMint,
      onSigned,
    }: CreateEscrowParams): Promise<string> => {
      if (!publicKey || !program || !wallet) {
        throw new Error("Wallet not connected");
      }

      const rentTime = new BN(escrowRentTime(checkInDate));
      const amountEscrow = new BN(toUSDCAmount(amount));
      const escrowPDA = getEscrowPDA(apartmentId);
      if (!escrowPDA) {
        throw new Error("Could not derive escrow PDA");
      }

      const guestTokenAccount = await getAssociatedTokenAddress(
        usdcMint,
        publicKey,
      );

      const escrowTokenAccount = await getAssociatedTokenAddress(
        usdcMint,
        escrowPDA,
        true,
      );

      const transaction = await program.methods
        .initialize(new BN(apartmentId), amountEscrow, rentTime)
        .accountsPartial({
          escrowAccount: escrowPDA,
          escrowTokenAccount,
          guestTokenAccount,
          guest: publicKey,
          usdcMint,
          owner: ownerAddress,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .transaction();

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signedTx = await wallet.signTransaction(transaction);
      const signature = utils.bytes.bs58.encode(signedTx.signature!);
      onSigned?.({ signature, lastValidBlockHeight });

      await connection.sendRawTransaction(signedTx.serialize(), {
        preflightCommitment: "confirmed",
      });
      const { value } = await connection.confirmTransaction(
        { blockhash, lastValidBlockHeight, signature },
        "confirmed",
      );
      if (value.err) {
        throw new Error(
          `Transaction ${signature} failed: ${JSON.stringify(value.err)}`,
        );
      }

      return signature;
    },
    [publicKey, program, wallet, connection, toUSDCAmount, getEscrowPDA],
  );

  const createEscrowTokenAccount = useCallback(
    async (apartmentId: number): Promise<string> => {
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      if (!publicKey || !wallet) {
        throw new Error("Wallet not connected");
      }

      const escrowPDA = getEscrowPDA(apartmentId);
      if (!escrowPDA) {
        throw new Error("Could not derive escrow PDA");
      }

      const escrowTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        escrowPDA,
        true,
      );

      const instruction = createAssociatedTokenAccountIdempotentInstruction(
        publicKey,
        escrowTokenAccount,
        escrowPDA,
        USDC_MINT,
      );

      const transaction = new Transaction({
        blockhash,
        lastValidBlockHeight,
        feePayer: publicKey,
      }).add(instruction);

      const signedTx = await wallet.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(
        signedTx.serialize(),
      );

      await connection.confirmTransaction(
        {
          blockhash,
          lastValidBlockHeight,
          signature,
        },
        "confirmed",
      );

      return signature;
    },
    [wallet, connection, publicKey, getEscrowPDA],
  );

  const releasePayment = useCallback(
    async ({
      apartmentId,
      guestAddress,
    }: ReleasePaymentParams): Promise<string> => {
      if (!wallet || !program) {
        throw new Error("Wallet not connected or program not initialized");
      }

      const escrowPda = getPdaGuest(guestAddress, apartmentId);

      const escrowTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        escrowPda,
        true,
      );

      const ownerTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        OWNER_ADDRESS,
      );

      const paymentReleaseAmount = await program?.methods
        .releasePayment()
        .accountsPartial({
          escrowAccount: getPdaGuest(guestAddress, apartmentId),
          escrowTokenAccount,
          ownerTokenAccount,
          owner: OWNER_ADDRESS,
          guest: guestAddress,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      return paymentReleaseAmount;
    },
    [program, wallet, getPdaGuest],
  );

  const cancelBooking = useCallback(
    async ({ apartmentId }: CancelBookingParams): Promise<string> => {
      if (!wallet || !program) {
        throw new Error(
          "Either wallet connection is missing or program unavailable",
        );
      }

      const escrowPda = getPdaGuest(wallet.publicKey, apartmentId);

      const escrowTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        escrowPda,
        true,
      );

      const guestTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        wallet.publicKey,
      );

      const txSignature = await program?.methods
        .cancelBooking()
        .accountsPartial({
          escrowAccount: escrowPda,
          escrowTokenAccount,
          guest: wallet.publicKey,
          guestTokenAccount,
          usdcMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      return txSignature;
    },
    [program, wallet, getPdaGuest],
  );

  const isOwner = useMemo(() => {
    if (!publicKey) return;

    return publicKey.equals(OWNER_ADDRESS);
  }, [publicKey]);

  return {
    program,
    connected,
    isOwner,
    publicKey,
    fromUSDCAmount,
    getEscrowPDA,
    getPdaGuest,
    createEscrow,
    createEscrowTokenAccount,
    hasActiveBooking,
    settleSignedPayment,
    releasePayment,
    cancelBooking,
    OWNER_ADDRESS,
    USDC_MINT,
  };
};

export default useRentalProgram;
