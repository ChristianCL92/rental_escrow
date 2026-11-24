import { BN, BorshCoder, type Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "@/lib/idl/rental_escrow.json";

/**
 * The escrow program's addresses and data layouts, shared by the browser
 * (which pays into the escrow) and the server (which checks the chain before
 * it confirms, cancels or releases a booking).
 */

export const PROGRAM_ID = new PublicKey(idl.address);

const coder = new BorshCoder(idl as Idl);

/**
 * The guest's escrow for a room. The program seeds it with [guest, room]
 * only, so a guest holds one escrow per room at a time and the address says
 * nothing about the dates: those live in the account's `rent_time`.
 */
export const escrowAddress = (
  guest: PublicKey,
  apartmentId: number,
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("escrow"),
      guest.toBuffer(),
      new BN(apartmentId).toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID,
  )[0];

export interface EscrowData {
  apartmentId: number;
  /** USDC base units. */
  amount: bigint;
  guest: string;
  /** Check-in instant, Unix seconds (midnight UTC of the check-in day). */
  rentTime: number;
  rentEnded: boolean;
}

/** Decodes an EscrowAccount, or null when the bytes are not one. */
export const decodeEscrowAccount = (data: Uint8Array): EscrowData | null => {
  try {
    const raw = coder.accounts.decode("EscrowAccount", Buffer.from(data));
    return {
      apartmentId: raw.apartment_id.toNumber(),
      amount: BigInt(raw.amount.toString()),
      guest: raw.guest_address.toBase58(),
      rentTime: raw.rent_time.toNumber(),
      rentEnded: raw.rent_ended,
    };
  } catch {
    return null;
  }
};

export interface InitializeArgs {
  apartmentId: number;
  amount: bigint;
  rentTime: number;
}

/** Decodes the data of an `initialize` instruction, or null. */
export const decodeInitialize = (data: Uint8Array): InitializeArgs | null => {
  try {
    const decoded = coder.instruction.decode(Buffer.from(data));
    if (decoded?.name !== "initialize") return null;
    const args = decoded.data as Record<string, BN>;
    return {
      apartmentId: args.apartment_id.toNumber(),
      amount: BigInt(args.amount.toString()),
      rentTime: args.rent_time.toNumber(),
    };
  } catch {
    return null;
  }
};

/** Account positions in `initialize`, from the IDL. */
export const INITIALIZE_ACCOUNTS = {
  escrow: idl.instructions
    .find((ix) => ix.name === "initialize")!
    .accounts.findIndex((account) => account.name === "escrow_account"),
  guest: idl.instructions
    .find((ix) => ix.name === "initialize")!
    .accounts.findIndex((account) => account.name === "guest"),
};
