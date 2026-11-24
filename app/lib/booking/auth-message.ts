/**
 * The short, free message a guest's wallet signs to prove a booking request
 * is theirs. It is not a transaction and moves no money.
 *
 * The browser and the server build the text with the same function. The
 * server never parses a message the browser sends: it rebuilds the text from
 * the values it is about to act on (the action, the wallet, the room, the
 * dates) and checks the signature against that, so changing any value after
 * signing breaks the signature.
 */

export type SignedAction = "reserve" | "cancel" | "view";

/** How long a session from a "view" signature lasts, for My Bookings. */
export const SESSION_TTL_MS = 30 * 60 * 1000;

/** How long an unpaid hold blocks its nights. */
export const HOLD_TTL_MS = 10 * 60 * 1000;

export interface AuthFields {
  action: SignedAction;
  wallet: string;
  apartmentId?: number;
  checkInDate?: string;
  checkOutDate?: string;
  /** ISO 8601 time the browser created the message. */
  issuedAt: string;
  /** Random hex, so two messages are never the same. */
  nonce: string;
}

/** What the browser sends with a request: the signed fields' metadata. */
export interface SignedAuth {
  wallet: string;
  issuedAt: string;
  nonce: string;
  /** The ed25519 signature of the message, base64. */
  signature: string;
}

const HEADLINES: Record<SignedAction, string> = {
  reserve: `El Solar: hold these nights for ${HOLD_TTL_MS / 60_000} minutes while you pay`,
  cancel: "El Solar: cancel this booking",
  view: `El Solar: show my bookings for ${SESSION_TTL_MS / 60_000} minutes`,
};

export const buildAuthMessage = (fields: AuthFields): string => {
  const lines = [
    HEADLINES[fields.action],
    "",
    "Signing is free. It is not a transaction and moves no money.",
    "",
    `Action: ${fields.action}`,
    `Wallet: ${fields.wallet}`,
  ];
  if (fields.apartmentId !== undefined) {
    lines.push(`Apartment: ${fields.apartmentId}`);
  }
  if (fields.checkInDate !== undefined) {
    lines.push(`Check-in: ${fields.checkInDate}`);
  }
  if (fields.checkOutDate !== undefined) {
    lines.push(`Check-out: ${fields.checkOutDate}`);
  }
  lines.push(`Issued at: ${fields.issuedAt}`, `Nonce: ${fields.nonce}`);
  return lines.join("\n");
};

export const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const fromBase64 = (value: string): Uint8Array | null => {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};
