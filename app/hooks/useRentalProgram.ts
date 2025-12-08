"use client";

import { useMemo, useCallback } from "react"
import { useWallet, useConnection, useAnchorWallet } from "@solana/wallet-adapter-react"
import { AnchorProvider, Program, BN} from "@coral-xyz/anchor"
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js"
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token"
import idl from "@/lib/idl/rental_escrow.json"
import { RentalEscrow } from "@/lib/types/rental_escrow";


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

export interface ReleasePaymentParams {
    apartmentId: number;
    guestAddress: PublicKey;
}

interface EscrowData {
    apartmentId: BN;
    amount: BN;
    ownerAddress: PublicKey;
    guestAddress: PublicKey;
    rentTime: BN;
    rentStarted: boolean;
    rentEnded: boolean;
}

interface EscrowInfo{
   publicKey: PublicKey;
  apartmentId: number;
  amount: number;
  ownerAddress: PublicKey;
  guestAddress: PublicKey;
  checkInDate: Date;
  rentStarted: boolean;
  rentEnded: boolean;
  canRelease: boolean;
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
    return new Program<RentalEscrow>(idl as RentalEscrow, provider)
 }, [connection, wallet])


 const readOnlyProgram = useMemo(() => {
  if (!wallet || !connected)  return;
  const provider = new AnchorProvider(connection, {} as any, {commitment: "confirmed"});

  return new Program<RentalEscrow>(idl as RentalEscrow, provider);
}, [connection])
 
 const toUSDCAmount = useCallback((amount: number) => {
    return amount * (Math.pow(10, USDC_DECIMALS));
 }, [])

 const fromUSDCAmount = useCallback((amount: BN) => {
    return amount.toNumber() / (Math.pow(10, USDC_DECIMALS));
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

const getPdaGuest = useCallback((guestAddress: PublicKey, apartmentId: number): PublicKey => {
  const apartmentIdBN = new BN(apartmentId);

  const [escrowPDAForGuest] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), guestAddress.toBuffer(), apartmentIdBN.toArrayLike(Buffer, "le", 8) ],
     PROGRAM_ID
    );

  return escrowPDAForGuest
}, []) 

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
      }as any).rpc();

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

  const getReleasePayment = useCallback(async ({
    apartmentId,
    guestAddress
    }: ReleasePaymentParams):Promise<string> => {
    if(!wallet || !program) {
      throw new Error("Wallet not connected or program not initialized");
    }

    const escrowPda = getPdaGuest(guestAddress, apartmentId);

    const escrowTokenAccount = await getAssociatedTokenAddress(
      USDC_MINT,
      escrowPda,
      true
    );

    const ownerTokenAccount = await getAssociatedTokenAddress(
    USDC_MINT,
    OWNER_ADDRESS
    )

    const paymentReleaseAmount = await program?.methods.releasePayment().accounts({
    escrowAccount: getPdaGuest(guestAddress, apartmentId),
    escrowTokenAccount,
    ownerTokenAccount,
    guest: guestAddress,
    usdcMint: USDC_MINT,
    tokenProgram: TOKEN_PROGRAM_ID
  }as any).rpc();
  
  return paymentReleaseAmount;
  }, [program, wallet, getPdaGuest])

  
  
  const fetchAllEscrows = useCallback(async():Promise<EscrowInfo[]> => {
    if(!program) {
      throw new Error("Program not initialized");
    }

       const accounts = await program?.account.escrowAccount.all();

       const date = Date.now();

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
        canRelease: !data.rentEnded && checkInDate.getTime() <= date
      };
    });
      
  }, [])
  
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