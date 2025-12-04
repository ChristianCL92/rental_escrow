"use client";

import { useMemo, useCallback } from "react"
import { useWallet, useConnection, useAnchorWallet } from "@solana/wallet-adapter-react"
import { AnchorProvider, Program, BN} from "@coral-xyz/anchor"
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token"
import idl from "@/lib/idl/rental_escrow.json"
import { get } from "http";

const PROGRAM_ID = new PublicKey(idl.address);

export const OWNER_ADDRESS = new PublicKey(process.env.NEXT_PUBLIC_OWNER_ADDRESS!);

export const USDC_MINT = new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS!);

export const USDC_DECIMALS = 6;

type RentalEscrowIDL = typeof idl;

export interface CreateEscrowParams {
    apartmentId: number;
    amount: number;
    checkInDate: Date;
    ownerAddress: PublicKey;
    usdcMint: PublicKey;
}

const useRentalProgram = () => {
  
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const {publicKey, connected} = useWallet();

 const program = useMemo(() => {
    if (!wallet || !connected) return;

    const provider = new AnchorProvider(
      connection,
      wallet,
      {commitment: "confirmed"}
    )
    return new Program(idl as RentalEscrowIDL, provider)
 }, [connection, wallet])

 const toUSDCAmount = useCallback((amount: number) => {
    return amount * (Math.pow(10, USDC_DECIMALS));
 }, [])

const getEscrowPDA = useCallback((apartmentId: number): PublicKey | null => {
    if(!publicKey) return null;

    const apartmentIdBN = new BN(apartmentId);
    const [escrowPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"),
       publicKey.toBuffer(),
       apartmentIdBN.toArrayLike(Buffer, "le", 8)
      ],
      PROGRAM_ID     
    )
    return escrowPDA;
}, [publicKey])

const createEscrow = useCallback(async ({
    amount,
    apartmentId,
    checkInDate,
    ownerAddress,
    usdcMint 
  }: CreateEscrowParams):Promise<string> => {
    if(!publicKey || !program || !wallet) {
      throw new Error("Wallet not connected");
    }  
  
    const rentTime = new BN(Math.floor(checkInDate.getTime() / 1000));
    const amountEscrow = new BN(toUSDCAmount(amount));
    const escrowPDA = getEscrowPDA(apartmentId);
    if (!escrowPDA) {
      throw new Error("Could not derive escrow PDA");
    }

    const guestTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      publicKey
    );
  
    const escrowTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      escrowPDA,
      true
    );

    const tx = await program.methods.initialize(new BN(apartmentId), amountEscrow, rentTime)
    .accounts({
        escrowAccount: escrowPDA,
        escrowTokenAccount,
        guestTokenAccount,
        guest: publicKey,
        usdcMint,
        owner: ownerAddress,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId
      }).rpc();

    return tx;
  }, [publicKey, program, wallet, toUSDCAmount, getEscrowPDA])

  const createEscrowTokenAccount = useCallback(async(apartmentId: number):Promise<string> => {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();  
    if(!publicKey || !wallet) {
        throw new Error("Wallet not connected");
      }

      const escrowPDA = getEscrowPDA(apartmentId);
      if(!escrowPDA) {
        throw new Error("Could not derive escrow PDA");
      }

      const escrowTokenAccount = await getAssociatedTokenAddress(
        USDC_MINT,
        escrowPDA,
        true
      );
      
      const instruction = createAssociatedTokenAccountIdempotentInstruction(
        publicKey,
        escrowTokenAccount,
        escrowPDA,
        USDC_MINT
      )

      const transaction = new Transaction({
        blockhash,
        lastValidBlockHeight,
        feePayer: publicKey  
      }).add(instruction);

      const signedTx = await wallet.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTx.serialize());

      await connection.confirmTransaction({
      blockhash,
      lastValidBlockHeight,
      signature,
      }, "confirmed")

      return signature
      
  }, [wallet, connection, publicKey, getEscrowPDA])
  
  return {
    program,
    connected,
    publicKey,
    getEscrowPDA,
    createEscrow,
    createEscrowTokenAccount,
    OWNER_ADDRESS,
    USDC_MINT

  }
}

export default useRentalProgram