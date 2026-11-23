import { PublicKey } from "@solana/web3.js";
import { rentTimeForDay, USDC_DECIMALS } from "@/lib/booking/escrow";
import { nightsBetween, Stay } from "@/lib/booking/limits";
import { properties } from "@/lib/properties";
import {
  decodeEscrowAccount,
  decodeInitialize,
  escrowAddress,
  INITIALIZE_ACCOUNTS,
  PROGRAM_ID,
} from "@/lib/solana/escrow-account";
import type { EscrowChain } from "./chain";

/**
 * On-chain proof behind booking status changes. A booking is confirmed only
 * by a transaction that really funded this guest's escrow for this room and
 * these dates, and cancelled or released only when that escrow is not open.
 */

/** What the guest pays for a stay, in USDC base units. */
export const stayAmount = (stay: Stay): bigint | null => {
  const property = properties.find((p) => p.apartmentId === stay.apartmentId);
  if (!property) return null;
  return (
    BigInt(property.pricePerNight) *
    BigInt(nightsBetween(stay.checkInDate, stay.checkOutDate)) *
    BigInt(10 ** USDC_DECIMALS)
  );
};

const TX_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

export const isTxSignature = (value: unknown): value is string =>
  typeof value === "string" && TX_SIGNATURE.test(value);

export type FundingCheck =
  | { ok: true }
  | { ok: false; status: 409 | 503; error: string };

export interface FundingOptions {
  /** Lookups before a missing transaction counts as not on chain. */
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Checks that `txSignature` is a successful transaction, signed by `wallet`,
 * whose `initialize` instruction funded the escrow of `wallet` for the stay's
 * room, check-in day and price.
 */
export const verifyFunding = async (
  chain: EscrowChain,
  txSignature: string,
  wallet: string,
  stay: Stay,
  { attempts = 3, sleep }: FundingOptions = {},
): Promise<FundingCheck> => {
  let tx = null;
  try {
    // The browser reports the payment as soon as its own RPC node confirms
    // it; ours can lag a moment behind.
    for (let attempt = 1; attempt <= attempts; attempt++) {
      tx = await chain.getTransaction(txSignature);
      if (tx || attempt === attempts) break;
      await sleep?.(1500);
    }
  } catch (error) {
    console.error("payment lookup failed:", error);
    return {
      ok: false,
      status: 503,
      error: "We couldn't check the payment on the network. Please try again.",
    };
  }

  const refuse = (error: string): FundingCheck => ({
    ok: false,
    status: 409,
    error,
  });
  if (!tx) return refuse("This payment is not on the network.");
  if (tx.failed) return refuse("This payment failed on the network.");
  if (!tx.signers.includes(wallet)) {
    return refuse("This payment was not made by this wallet.");
  }

  const escrow = escrowAddress(new PublicKey(wallet), stay.apartmentId);
  const amount = stayAmount(stay);
  const rentTime = rentTimeForDay(stay.checkInDate);
  const funded = tx.instructions.some((ix) => {
    if (ix.programId !== PROGRAM_ID.toBase58()) return false;
    const args = decodeInitialize(ix.data);
    return (
      args !== null &&
      ix.accounts[INITIALIZE_ACCOUNTS.escrow] === escrow.toBase58() &&
      ix.accounts[INITIALIZE_ACCOUNTS.guest] === wallet &&
      args.apartmentId === stay.apartmentId &&
      args.rentTime === rentTime &&
      args.amount === amount
    );
  });
  return funded
    ? { ok: true }
    : refuse("This payment did not fund this booking's escrow.");
};

export interface StayOf {
  wallet: string;
  stay: Stay;
}

/**
 * For each booking, whether its escrow is open on chain: the guest's escrow
 * for the room exists and holds this check-in and this stay's price. A guest
 * has one escrow per room, so an escrow for other dates or another amount
 * means this booking's escrow is closed.
 * Throws when the network cannot be read; callers must then keep the
 * booking as it is.
 */
export const escrowsOpen = async (
  chain: EscrowChain,
  bookings: StayOf[],
): Promise<boolean[]> => {
  if (bookings.length === 0) return [];
  const accounts = await chain.getAccounts(
    bookings.map(({ wallet, stay }) =>
      escrowAddress(new PublicKey(wallet), stay.apartmentId),
    ),
  );
  return bookings.map(({ wallet, stay }, i) => {
    const account = accounts[i];
    if (!account) return false;
    if (account.owner !== PROGRAM_ID.toBase58()) return false;
    const escrow = decodeEscrowAccount(account.data);
    // Only the program can create this address; data it cannot read is
    // treated as open rather than guessed closed.
    if (!escrow) return true;
    return (
      escrow.guest === wallet &&
      escrow.apartmentId === stay.apartmentId &&
      escrow.rentTime === rentTimeForDay(stay.checkInDate) &&
      escrow.amount === stayAmount(stay)
    );
  });
};
