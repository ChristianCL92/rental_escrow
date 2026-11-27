import { describe, expect, it } from "bun:test";
import {
  ActiveBookingError,
  ApiError,
  DatesTakenError,
  describeBookingError,
  describeCancelError,
  describeExpiredPayment,
  errorDetail,
} from "./errors";

// Shapes below mirror what the libraries really throw: the wallet adapter's
// WalletSignTransactionError wraps the wallet's error in `.error`, web3.js
// SendTransactionError and Anchor errors carry program `logs`.
class WalletSignTransactionError extends Error {
  error: unknown;
  constructor(message: string, error?: unknown) {
    super(message);
    this.name = "WalletSignTransactionError";
    this.error = error;
  }
}

class SendTransactionError extends Error {
  logs: string[];
  constructor(message: string, logs: string[]) {
    super(message);
    this.name = "SendTransactionError";
    this.logs = logs;
  }
}

const rejection = new WalletSignTransactionError("User rejected the request.", {
  code: 4001,
  message: "User rejected the request.",
});

describe("describeBookingError", () => {
  it("explains taken dates from the availability check", () => {
    const result = describeBookingError(new DatesTakenError(), {
      stage: "reserving",
    });
    expect(result.title).toBe("Those dates were just taken");
    expect(result.message).toContain("Nothing was charged");
    expect(result.action).toBe("pick-dates");
  });

  it("explains taken dates from a 409 double-booking response", () => {
    const result = describeBookingError(
      new ApiError(
        "Error, double booking attempt, dates no longer available!",
        409,
      ),
      { stage: "reserving" },
    );
    expect(result.title).toBe("Those dates were just taken");
    expect(result.detail).toContain("double booking attempt");
  });

  it("explains an existing escrow found before paying", () => {
    const result = describeBookingError(new ActiveBookingError(), {
      stage: "reserving",
    });
    expect(result.title).toBe(
      "You already have an active booking for this room",
    );
    expect(result.action).toBe("my-bookings");
  });

  it("explains an existing escrow reported by the system program", () => {
    const result = describeBookingError(
      new SendTransactionError(
        "Simulation failed. Message: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0.",
        [
          "Program 11111111111111111111111111111111 invoke [2]",
          "Allocate: account Address { address: 9xQe..., base: None } already in use",
          "Program 11111111111111111111111111111111 failed: custom program error: 0x0",
        ],
      ),
      { stage: "payment" },
    );
    expect(result.title).toBe(
      "You already have an active booking for this room",
    );
  });

  it("says nothing was charged when the first wallet prompt is cancelled", () => {
    const result = describeBookingError(rejection, { stage: "account" });
    expect(result.title).toBe(
      "You cancelled in your wallet - nothing was charged",
    );
  });

  it("is precise about the SOL fee when the payment prompt is cancelled", () => {
    const result = describeBookingError(rejection, { stage: "payment" });
    expect(result.title).toBe(
      "You cancelled in your wallet - no USDC was charged",
    );
    expect(result.message).toContain("SOL network fee");
  });

  it("recognises a rejection by the 4001 code alone", () => {
    const result = describeBookingError(
      new WalletSignTransactionError("", { code: 4001 }),
      { stage: "account" },
    );
    expect(result.title).toContain("You cancelled in your wallet");
  });

  it("asks for SOL when the wallet has none", () => {
    const result = describeBookingError(
      new SendTransactionError(
        "Simulation failed. Message: Transaction simulation failed: Attempt to debit an account but found no record of a prior credit.",
        [],
      ),
      { stage: "account" },
    );
    expect(result.title).toBe("You need a little SOL for fees");
    expect(result.action).toBe("get-sol");
  });

  it("asks for USDC when the token transfer fails for funds", () => {
    const result = describeBookingError(
      new SendTransactionError("custom program error: 0x1", [
        "Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [2]",
        "Program log: Error: insufficient funds",
      ]),
      { stage: "payment", totalUsdc: 90 },
    );
    expect(result.title).toBe("Not enough USDC in this wallet");
    expect(result.message).toContain("This stay costs 90\u00a0USDC.");
  });

  it("asks for USDC when the guest has no USDC account at all", () => {
    const result = describeBookingError(
      new Error(
        "AnchorError caused by account: guest_token_account. Error Code: AccountNotInitialized. Error Number: 3012.",
      ),
      { stage: "payment", totalUsdc: 30 },
    );
    expect(result.title).toBe("Not enough USDC in this wallet");
  });

  it("warns not to pay twice when the payment could not be confirmed", () => {
    const result = describeBookingError(
      new Error(
        "Signature abc has expired: block height exceeded. TransactionExpiredBlockheightExceededError",
      ),
      { stage: "payment" },
    );
    expect(result.title).toBe("We couldn't confirm your payment");
    expect(result.message).toContain("don't pay twice");
    expect(result.action).toBe("my-bookings");
    expect(result.paymentMayHaveLanded).toBe(true);
  });

  it("keeps the dates held when the payment request lost the network", () => {
    const result = describeBookingError(new TypeError("Failed to fetch"), {
      stage: "payment",
    });
    expect(result.paymentMayHaveLanded).toBe(true);
  });

  it("releases the dates when the payment certainly did not move USDC", () => {
    expect(
      describeBookingError(rejection, { stage: "payment" })
        .paymentMayHaveLanded,
    ).toBeFalsy();
    expect(
      describeBookingError(new TypeError("Failed to fetch"), {
        stage: "account",
      }).paymentMayHaveLanded,
    ).toBeFalsy();
  });

  it("keeps a raw API failure out of the title", () => {
    const result = describeBookingError(
      new ApiError("Internal server error", 500),
      { stage: "reserving" },
    );
    expect(result.title).toBe("Your booking didn't go through");
    expect(result.title).not.toContain("Internal server error");
    expect(result.message).toContain("Nothing was charged");
    expect(result.detail).toBe("ApiError\nInternal server error");
  });

  it("never claims nothing was charged for an unknown payment failure", () => {
    const result = describeBookingError(new Error("Something odd"), {
      stage: "payment",
    });
    expect(result.message).not.toContain("Nothing was charged");
    expect(result.action).toBe("my-bookings");
  });
});

describe("describeExpiredPayment", () => {
  it("releases the dates and says no USDC moved", () => {
    const result = describeExpiredPayment("Failed to fetch");
    expect(result.title).toBe("Your payment didn't go through");
    expect(result.message).toContain("No USDC was charged");
    expect(result.paymentMayHaveLanded).toBeFalsy();
    expect(result.detail).toBe("Failed to fetch");
  });
});

describe("describeCancelError", () => {
  it("says the booking is untouched when the wallet prompt is cancelled", () => {
    const result = describeCancelError(rejection);
    expect(result.title).toBe("You cancelled in your wallet - nothing changed");
  });

  it("explains the program's check-in cut-off", () => {
    const result = describeCancelError(
      new Error(
        "AnchorError thrown in programs/rental_escrow/src/instructions/cancel_booking.rs:11. Error Code: CannotCancelAfterCheckIn. Error Number: 6002.",
      ),
    );
    expect(result.title).toBe("This booking can no longer be cancelled");
  });
});

describe("errorDetail", () => {
  it("joins name, message, logs and the wrapped wallet error without repeats", () => {
    expect(errorDetail(rejection)).toBe(
      "WalletSignTransactionError\nUser rejected the request.",
    );
  });

  it("falls back for empty values", () => {
    expect(errorDetail(undefined)).toBe("Unknown error");
  });
});
