import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { HOLD_TTL_MS } from "@/lib/booking/auth-message";

export type ProgressStep =
  | "signing"
  | "reserving"
  | "account"
  | "payment"
  | "confirming"
  | "confirmed";

const STEPS: { id: Exclude<ProgressStep, "confirming">; label: string }[] = [
  { id: "signing", label: "Sign to reserve" },
  { id: "reserving", label: "Reserving dates" },
  { id: "account", label: "Approve in wallet (1 of 2)" },
  { id: "payment", label: "Approve payment (2 of 2)" },
  { id: "confirmed", label: "Confirmed" },
];

export const stepHint = (step: ProgressStep, totalUsdc: number): string => {
  switch (step) {
    case "signing":
      return `Your wallet asks you to sign a short message. Signing is free, is not a transaction and moves no money. It proves this booking is yours and holds the nights for ${HOLD_TTL_MS / 60_000} minutes while you pay.`;
    case "reserving":
      return "Checking the nights are still free and holding them for you.";
    case "account":
      return "Your wallet asks you to approve a setup step. It creates the escrow account for this stay and uses a little SOL - no USDC moves yet.";
    case "payment":
      return `Your wallet asks a second time. This approval moves ${totalUsdc} USDC into escrow. It is the only payment, not a double charge.`;
    case "confirming":
      return "Confirming your payment... The network is slow to confirm it. This can take a minute or two, and there is nothing else you need to do.";
    case "confirmed":
      return "Booking confirmed.";
  }
};

/** Short text for the screen-reader status region. */
export const stepAnnouncement = (step: ProgressStep): string => {
  switch (step) {
    case "signing":
      return "Sign the free message in your wallet to reserve your dates.";
    case "reserving":
      return "Reserving your dates.";
    case "account":
      return "Approve in your wallet, step 1 of 2.";
    case "payment":
      return "Approve the payment in your wallet, step 2 of 2.";
    case "confirming":
      return "Confirming your payment.";
    case "confirmed":
      return "Booking confirmed.";
  }
};

interface BookingProgressProps {
  step: ProgressStep;
  totalUsdc: number;
}

/**
 * One click on Book leads to a free signature and then two wallet approvals.
 * This list shows where the guest is, so the signature does not read as a
 * charge and the second approval reads as step 2 of 2 rather than a repeat
 * charge.
 */
const BookingProgress = ({ step, totalUsdc }: BookingProgressProps) => {
  const current = STEPS.findIndex(
    (s) => s.id === (step === "confirming" ? "confirmed" : step),
  );

  return (
    <div className="mt-4 rounded-lg border p-4" data-testid="booking-progress">
      <p className="text-sm font-semibold">Booking in progress</p>
      <ol className="mt-3 space-y-2.5 text-sm">
        {STEPS.map((s, i) => {
          const state =
            i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li
              key={s.id}
              aria-current={state === "current" ? "step" : undefined}
              className="flex items-center gap-2.5"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  state === "done" && "bg-emerald-700 text-white",
                  state === "current" && "bg-inverse text-inverse-foreground",
                  state === "todo" &&
                    "bg-card text-muted-foreground ring-1 ring-input",
                )}
              >
                {state === "done" ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : state === "current" ? (
                  <Loader2 className="size-3 animate-spin" strokeWidth={3} />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  state === "current" && "font-semibold text-foreground",
                  state === "done" && "text-foreground",
                  state === "todo" && "text-muted-foreground",
                )}
              >
                {s.label}
                <span className="sr-only">
                  {state === "done"
                    ? " (done)"
                    : state === "current"
                      ? " (in progress)"
                      : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
        {stepHint(step, totalUsdc)}
      </p>
    </div>
  );
};

export default BookingProgress;
