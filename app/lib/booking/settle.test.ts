import { describe, expect, it } from "bun:test";
import { settlePayment } from "./settle";

// A Solana transaction can land while the chain's block height is at most
// its blockhash's lastValidBlockHeight, and never after.
const LAST_VALID = 1_000;

/** A fake chain: the height and escrow presence for each check, in order. */
const chain = (checks: ({ height: number; escrow: boolean } | "fail")[]) => {
  let i = 0;
  let current = checks[0];
  const sleeps: number[] = [];
  return {
    sleeps,
    checks: {
      blockHeight: async () => {
        current = checks[Math.min(i++, checks.length - 1)];
        if (current === "fail") throw new TypeError("Failed to fetch");
        return current.height;
      },
      escrowExists: async () => {
        if (current === "fail") throw new TypeError("Failed to fetch");
        return current.escrow;
      },
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    },
  };
};

describe("settlePayment", () => {
  it("waits while the blockhash is valid and reports a late-landing payment", async () => {
    const { checks, sleeps } = chain([
      { height: 990, escrow: false },
      { height: 995, escrow: false },
      { height: 999, escrow: true },
    ]);
    expect(await settlePayment(LAST_VALID, checks)).toBe("landed");
    expect(sleeps).toHaveLength(2);
  });

  it("does not call a missing escrow final at the last valid height", async () => {
    const { checks } = chain([
      { height: LAST_VALID, escrow: false },
      { height: LAST_VALID + 1, escrow: true },
    ]);
    expect(await settlePayment(LAST_VALID, checks)).toBe("landed");
  });

  it("reports expiry once the chain is past the blockhash with no escrow", async () => {
    const { checks } = chain([
      { height: 990, escrow: false },
      { height: LAST_VALID + 1, escrow: false },
    ]);
    expect(await settlePayment(LAST_VALID, checks)).toBe("expired");
  });

  it("gives up as unknown when the checks keep failing", async () => {
    const { checks } = chain(["fail"]);
    expect(await settlePayment(LAST_VALID, checks, { maxFailures: 3 })).toBe(
      "unknown",
    );
  });

  it("recovers from a failed check and keeps waiting", async () => {
    const { checks } = chain([
      "fail",
      "fail",
      { height: 990, escrow: false },
      "fail",
      { height: LAST_VALID + 5, escrow: false },
    ]);
    expect(await settlePayment(LAST_VALID, checks, { maxFailures: 3 })).toBe(
      "expired",
    );
  });

  it("stops after a bounded number of checks if the chain stalls", async () => {
    const { checks, sleeps } = chain([{ height: 990, escrow: false }]);
    expect(await settlePayment(LAST_VALID, checks, { maxChecks: 4 })).toBe(
      "unknown",
    );
    expect(sleeps).toHaveLength(3);
  });
});
