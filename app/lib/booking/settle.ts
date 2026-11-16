/**
 * Settles a payment that was signed but whose confirmation failed (a timeout
 * or a dropped connection). The transaction may still land until its
 * blockhash expires, so "no escrow yet" only means "not charged" once the
 * chain is past the transaction's last valid block height.
 */

export type PaymentOutcome = "landed" | "expired" | "unknown";

export interface SettleChecks {
  /** The confirmed block height of the chain. */
  blockHeight: () => Promise<number>;
  /** Whether this guest's escrow for the room exists on chain. */
  escrowExists: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
}

export interface SettleOptions {
  intervalMs?: number;
  /** Consecutive failed checks before giving up. */
  maxFailures?: number;
  /** Checks before giving up, so a stalled chain cannot hold the guest. */
  maxChecks?: number;
}

export const settlePayment = async (
  lastValidBlockHeight: number,
  { blockHeight, escrowExists, sleep }: SettleChecks,
  { intervalMs = 2000, maxFailures = 5, maxChecks = 90 }: SettleOptions = {},
): Promise<PaymentOutcome> => {
  let failures = 0;
  for (let check = 1; ; check++) {
    try {
      // Read the height before the escrow: once the height is past the
      // blockhash, any landing is already visible to the escrow lookup.
      const height = await blockHeight();
      if (await escrowExists()) return "landed";
      if (height > lastValidBlockHeight) return "expired";
      failures = 0;
    } catch {
      failures += 1;
      if (failures >= maxFailures) return "unknown";
    }
    if (check >= maxChecks) return "unknown";
    await sleep(intervalMs);
  }
};
