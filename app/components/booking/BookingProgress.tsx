import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProgressStep = "reserving" | "account" | "payment" | "confirmed";

const STEPS: { id: ProgressStep; label: string }[] = [
  { id: "reserving", label: "Reserving dates" },
  { id: "account", label: "Approve in wallet (1 of 2)" },
  { id: "payment", label: "Approve payment (2 of 2)" },
  { id: "confirmed", label: "Confirmed" },
];

export const stepHint = (step: ProgressStep, totalUsdc: number): string => {
  switch (step) {
    case "reserving":
      return "Checking the nights are still free and holding them for you.";
    case "account":
      return "Your wallet asks you to approve a setup step. It creates the escrow account for this stay and uses a little SOL - no USDC moves yet.";
    case "payment":
      return `Your wallet asks a second time. This approval moves ${totalUsdc} USDC into escrow. It is the only payment, not a double charge.`;
    case "confirmed":
      return "Booking confirmed.";
  }
};

/** Short text for the screen-reader status region. */
export const stepAnnouncement = (step: ProgressStep): string => {
  switch (step) {
    case "reserving":
      return "Reserving your dates.";
    case "account":
      return "Approve in your wallet, step 1 of 2.";
    case "payment":
      return "Approve the payment in your wallet, step 2 of 2.";
    case "confirmed":
      return "Booking confirmed.";
  }
};

interface BookingProgressProps {
  step: ProgressStep;
  totalUsdc: number;
}

/**
 * One click on Book leads to two wallet prompts. This list shows where the
 * guest is, so the second prompt reads as step 2 of 2 rather than a repeat
 * charge.
 */
const BookingProgress = ({ step, totalUsdc }: BookingProgressProps) => {
  const current = STEPS.findIndex((s) => s.id === step);

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
                  state === "current" && "bg-primary text-primary-foreground",
                  state === "todo" &&
                    "bg-white text-slate-600 ring-1 ring-slate-300",
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
                  state === "done" && "text-slate-700",
                  state === "todo" && "text-slate-600",
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
      <p className="mt-3 border-t pt-3 text-sm text-slate-700">
        {stepHint(step, totalUsdc)}
      </p>
    </div>
  );
};

export default BookingProgress;
