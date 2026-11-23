import { createHash } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519";
import {
  AuthFields,
  buildAuthMessage,
  fromBase64,
  HOLD_TTL_MS,
} from "@/lib/booking/auth-message";
import { isWalletAddress } from "@/lib/booking/limits";
import { PublicKey } from "@solana/web3.js";
import type { AuthStore } from "./auth-store";

/** A fresh signature (create, cancel, sign-in) is valid this long. */
export const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * The reserve signature also covers what happens to that one hold
 * afterwards: confirming it once the payment is on chain, or releasing it
 * when the guest backs out. Both are bound to the signed room and dates, and
 * confirming also needs the on-chain payment. The window covers the hold
 * plus the time a late payment can still take to land and be checked.
 */
export const FOLLOW_UP_MAX_AGE_MS = HOLD_TTL_MS + 10 * 60 * 1000;

/** Allowed drift between the guest's clock and the server's. */
export const CLOCK_SKEW_MS = 60 * 1000;

export type SignedFields = Omit<AuthFields, "wallet" | "issuedAt" | "nonce">;

export type AuthFailure = { ok: false; status: 401 | 503; error: string };
export type AuthResult = { ok: true; wallet: string; replayKey: string };

export interface VerifyOptions {
  now: number;
  maxAgeMs: number;
}

const NONCE = /^[0-9a-f]{16,64}$/;

const unauthorized = (error: string): AuthFailure => ({
  ok: false,
  status: 401,
  error,
});

/**
 * Checks that `auth` is the wallet's ed25519 signature of the message for
 * exactly `fields`, issued within `maxAgeMs`. It does not mark the signature
 * used; call `consumeSignature` right before the write it authorizes.
 */
export const verifySignedRequest = (
  auth: unknown,
  fields: SignedFields,
  { now, maxAgeMs }: VerifyOptions,
): AuthResult | AuthFailure => {
  if (auth === null || typeof auth !== "object") {
    return unauthorized("This request must be signed with your wallet.");
  }
  const { wallet, issuedAt, nonce, signature } = auth as Record<
    string,
    unknown
  >;
  if (
    typeof issuedAt !== "string" ||
    typeof nonce !== "string" ||
    typeof signature !== "string"
  ) {
    return unauthorized("This request must be signed with your wallet.");
  }
  if (!isWalletAddress(wallet)) {
    return unauthorized("The signing wallet address is not valid.");
  }
  if (!NONCE.test(nonce)) {
    return unauthorized("The signed request is malformed.");
  }

  const issued = Date.parse(issuedAt);
  if (Number.isNaN(issued) || new Date(issued).toISOString() !== issuedAt) {
    return unauthorized("The signed request is malformed.");
  }
  if (issued > now + CLOCK_SKEW_MS || now - issued > maxAgeMs) {
    return unauthorized("Your signature expired. Please sign again.");
  }

  const signatureBytes = fromBase64(signature);
  if (!signatureBytes || signatureBytes.length !== 64) {
    return unauthorized("The signature does not match this request.");
  }
  const message = buildAuthMessage({ ...fields, wallet, issuedAt, nonce });
  const messageBytes = new TextEncoder().encode(message);
  let valid = false;
  try {
    valid = ed25519.verify(
      signatureBytes,
      messageBytes,
      new PublicKey(wallet).toBytes(),
      // Strict RFC 8032 checks: one valid signature per message and key.
      { zip215: false },
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    return unauthorized("The signature does not match this request.");
  }

  return {
    ok: true,
    wallet,
    replayKey: `sig:${createHash("sha256").update(messageBytes).digest("hex")}`,
  };
};

/**
 * Marks a verified signature as used, so the same signed request cannot be
 * sent twice. The record outlives the signature's validity window.
 */
export const consumeSignature = async (
  store: AuthStore,
  { replayKey }: AuthResult,
  maxAgeMs: number,
): Promise<AuthFailure | null> => {
  let fresh: boolean;
  try {
    fresh = await store.claimOnce(replayKey, maxAgeMs + CLOCK_SKEW_MS);
  } catch (error) {
    console.error("auth store unavailable:", error);
    return {
      ok: false,
      status: 503,
      error: "We couldn't verify your signature right now. Please try again.",
    };
  }
  return fresh
    ? null
    : unauthorized("This signature was already used. Please sign again.");
};
