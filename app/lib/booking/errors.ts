/**
 * Turns the raw errors a booking or cancellation can throw (API responses,
 * wallet adapters, web3.js, Anchor, the SPL token and system programs) into
 * short, plain-language messages. The raw text is kept as `detail` so it can
 * sit behind a "Details" toggle for support.
 *
 * Money claims here must stay true for the stage that failed:
 * - "reserving" happens before any wallet prompt, so nothing was charged;
 * - "account" creates the escrow token account (SOL only, no USDC moves);
 * - "payment" is the one transaction that moves USDC, and it is atomic, so a
 *   failed or rejected payment moved no USDC.
 */

export type BookingStage = "reserving" | "account" | "payment";

export type ErrorAction =
  | "pick-dates"
  | "my-bookings"
  | "get-sol"
  | "get-usdc"
  | "reconnect";

export interface FriendlyError {
  title: string;
  message: string;
  detail: string;
  action?: ErrorAction;
  /**
   * The payment may have reached the chain: check for the escrow before
   * releasing the dates the pending booking holds.
   */
  paymentMayHaveLanded?: boolean;
}

/** A non-2xx response from the app's own /api routes. */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** The availability check found overlapping bookings. */
export class DatesTakenError extends Error {
  constructor(message = "Selected dates overlap an existing booking") {
    super(message);
    this.name = "DatesTakenError";
  }
}

/**
 * The escrow account for this guest and room already exists. The program
 * derives it from [guest, apartment], so a guest can hold one booking per
 * room at a time.
 */
export class ActiveBookingError extends Error {
  constructor(
    message = "Escrow account for this guest and room already exists",
  ) {
    super(message);
    this.name = "ActiveBookingError";
  }
}

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  logs?: unknown;
  error?: unknown;
  cause?: unknown;
};

const asErrorLike = (value: unknown): ErrorLike | null =>
  value !== null && typeof value === "object" ? (value as ErrorLike) : null;

const collectText = (value: unknown, depth = 0): string[] => {
  if (depth > 3 || value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  const error = asErrorLike(value);
  if (!error) return [String(value)];

  const parts: string[] = [];
  if (typeof error.name === "string" && error.name !== "Error") {
    parts.push(error.name);
  }
  if (typeof error.message === "string" && error.message) {
    parts.push(error.message);
  }
  if (Array.isArray(error.logs)) {
    parts.push(...error.logs.filter((l): l is string => typeof l === "string"));
  }
  // Wallet adapter errors wrap the wallet's own error in `.error`.
  parts.push(...collectText(error.error, depth + 1));
  parts.push(...collectText(error.cause, depth + 1));
  return parts;
};

/** The raw technical text for the "Details" toggle. */
export const errorDetail = (error: unknown): string => {
  const parts = collectText(error);
  const unique = parts.filter((part, i) => parts.indexOf(part) === i);
  return unique.join("\n") || "Unknown error";
};

const hasCode = (error: unknown, code: number, depth = 0): boolean => {
  const e = asErrorLike(error);
  if (!e || depth > 3) return false;
  return (
    e.code === code ||
    hasCode(e.error, code, depth + 1) ||
    hasCode(e.cause, code, depth + 1)
  );
};

const isRejected = (error: unknown, text: string): boolean =>
  hasCode(error, 4001) ||
  /user rejected|rejected the request|request rejected|denied|declined|cancell?ed by (the )?user|user cancell?ed/i.test(
    text,
  );

const isMissingSol = (text: string): boolean =>
  /no record of a prior credit|insufficient lamports|insufficient funds for (fee|rent)|InsufficientFundsFor(Fee|Rent)/i.test(
    text,
  );

// The SPL token program logs "Error: insufficient funds" when the guest's
// USDC balance is too low; Anchor reports AccountNotInitialized when the
// guest has never held USDC (no token account).
const isMissingUsdc = (text: string): boolean =>
  /Error: insufficient funds|AccountNotInitialized[\s\S]*guest_token_account|guest_token_account[\s\S]*AccountNotInitialized/i.test(
    text,
  );

const isAlreadyBooked = (error: unknown, text: string): boolean =>
  error instanceof ActiveBookingError ||
  asErrorLike(error)?.name === "ActiveBookingError" ||
  /already in use/i.test(text);

const isUnconfirmed = (text: string): boolean =>
  /block ?height exceeded|TransactionExpired|was not confirmed|timed out|timeout/i.test(
    text,
  );

const isNetworkFailure = (text: string): boolean =>
  /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(
    text,
  );

const isDisconnected = (text: string): boolean =>
  /WalletNotConnected|wallet not connected|wallet disconnected/i.test(text);

const statusOf = (error: unknown): number | undefined => {
  const e = asErrorLike(error);
  return e &&
    "status" in e &&
    typeof (e as { status?: unknown }).status === "number"
    ? (e as { status: number }).status
    : undefined;
};

export interface BookingErrorContext {
  stage: BookingStage;
  totalUsdc?: number;
}

export const describeBookingError = (
  error: unknown,
  { stage, totalUsdc }: BookingErrorContext,
): FriendlyError => {
  const detail = errorDetail(error);
  const text = detail;
  const status = statusOf(error);

  if (
    error instanceof DatesTakenError ||
    asErrorLike(error)?.name === "DatesTakenError" ||
    status === 409
  ) {
    return {
      title: "Those dates were just taken",
      message:
        "Someone booked some of these nights a moment ago. Nothing was charged - pick other nights and try again.",
      detail,
      action: "pick-dates",
    };
  }

  if (isAlreadyBooked(error, text)) {
    return {
      title: "You already have an active booking for this room",
      message:
        "A wallet can hold one booking per room at a time. You can see it, or cancel it before check-in, in My Bookings. No USDC was charged for this attempt.",
      detail,
      action: "my-bookings",
    };
  }

  if (isRejected(error, text)) {
    return stage === "payment"
      ? {
          title: "You cancelled in your wallet - no USDC was charged",
          message:
            "Only the small SOL network fee for the first approval was used. Your dates are released, so you can try again whenever you are ready.",
          detail,
        }
      : {
          title: "You cancelled in your wallet - nothing was charged",
          message:
            "Your dates are released. Book again whenever you are ready.",
          detail,
        };
  }

  if (isMissingSol(text)) {
    return {
      title: "You need a little SOL for fees",
      message:
        "Solana network fees are paid in SOL, separately from the USDC price. Add a small amount of SOL to this wallet and try again. No USDC was charged.",
      detail,
      action: "get-sol",
    };
  }

  if (isMissingUsdc(text)) {
    return {
      title: "Not enough USDC in this wallet",
      message: `${
        totalUsdc ? `This stay costs ${totalUsdc} USDC. ` : ""
      }Add USDC to this wallet and try again. No USDC was charged.`,
      detail,
      action: "get-usdc",
    };
  }

  if (status === 429) {
    return {
      title: "Too many attempts",
      message: "Please wait a minute and try again. Nothing was charged.",
      detail,
    };
  }

  if (isDisconnected(text)) {
    return {
      title: "Your wallet disconnected",
      message: `Reconnect your wallet and try again. ${
        stage === "reserving" ? "Nothing" : "No USDC"
      } was charged.`,
      detail,
      action: "reconnect",
    };
  }

  if (stage === "payment" && (isUnconfirmed(text) || isNetworkFailure(text))) {
    return {
      title: "We couldn't confirm your payment",
      message:
        "The network did not confirm the payment in time. Check My Bookings before trying again, so you don't pay twice.",
      detail,
      action: "my-bookings",
      paymentMayHaveLanded: true,
    };
  }

  if (isNetworkFailure(text) || isUnconfirmed(text)) {
    return {
      title: "We couldn't reach the network",
      message: `Check your connection and try again. ${
        stage === "reserving" ? "Nothing" : "No USDC"
      } was charged.`,
      detail,
    };
  }

  if (stage === "payment") {
    return {
      title: "Your booking didn't go through",
      message:
        "Check My Bookings before trying again: if the stay is not listed there, no USDC was charged.",
      detail,
      action: "my-bookings",
    };
  }

  return {
    title: "Your booking didn't go through",
    message: `${
      stage === "reserving" ? "Nothing" : "No USDC"
    } was charged. Please try again in a moment.`,
    detail,
  };
};

/**
 * Settles a payment that failed without a clear answer, once the chain has
 * been checked for this guest's escrow. The escrow did not exist before the
 * payment, so finding it means the payment went through.
 */
export const describeCheckedPayment = (
  detail: string,
  escrowExists: boolean,
): FriendlyError =>
  escrowExists
    ? {
        title: "Your payment went through",
        message:
          "The network was slow to confirm it, but your USDC is in escrow and the booking is in My Bookings. Don't pay again.",
        detail,
        action: "my-bookings",
        paymentMayHaveLanded: true,
      }
    : {
        title: "Your payment didn't go through",
        message:
          "No USDC was charged and your dates are released - you can try again.",
        detail,
      };

/** Plain-language errors for cancelling a booking on My Bookings. */
export const describeCancelError = (error: unknown): FriendlyError => {
  const detail = errorDetail(error);

  if (isRejected(error, detail)) {
    return {
      title: "You cancelled in your wallet - nothing changed",
      message: "Your booking is still active and your USDC is still in escrow.",
      detail,
    };
  }

  if (/CannotCancelAfterCheckIn/.test(detail)) {
    return {
      title: "This booking can no longer be cancelled",
      message:
        "Free cancellation ends at check-in. From then on the host can collect the payment.",
      detail,
    };
  }

  if (isMissingSol(detail)) {
    return {
      title: "You need a little SOL for fees",
      message:
        "Cancelling is a Solana transaction, and its network fee is paid in SOL. Add a small amount of SOL to this wallet and try again.",
      detail,
      action: "get-sol",
    };
  }

  return {
    title: "We couldn't cancel this booking",
    message:
      "Refresh to see its current status, then try again. If the booking is still listed, your USDC is still in escrow.",
    detail,
  };
};
