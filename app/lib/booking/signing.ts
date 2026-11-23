import type { PublicKey } from "@solana/web3.js";
import {
  AuthFields,
  buildAuthMessage,
  SignedAction,
  SignedAuth,
  toBase64,
} from "./auth-message";
import { MessageSigningUnsupportedError } from "./errors";

type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;

export type SignableFields = Pick<
  AuthFields,
  "apartmentId" | "checkInDate" | "checkOutDate"
>;

const randomNonce = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

/**
 * Asks the wallet to sign the booking message for `action`. Throws
 * MessageSigningUnsupportedError for a wallet that cannot sign messages, and
 * whatever the wallet throws when the guest refuses.
 */
export const signBookingAction = async (
  signMessage: SignMessage | undefined,
  publicKey: PublicKey | null,
  action: SignedAction,
  fields: SignableFields = {},
): Promise<SignedAuth> => {
  if (!publicKey) throw new Error("Wallet not connected");
  if (!signMessage) throw new MessageSigningUnsupportedError();

  const auth = {
    wallet: publicKey.toBase58(),
    issuedAt: new Date().toISOString(),
    nonce: randomNonce(),
  };
  const message = buildAuthMessage({ action, ...fields, ...auth });
  const signature = await signMessage(new TextEncoder().encode(message));
  return { ...auth, signature: toBase64(signature) };
};
