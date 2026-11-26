import { useId } from "react";
import { ShieldCheck } from "lucide-react";
import idl from "@/lib/idl/rental_escrow.json";
import { explorerUrl } from "@/lib/solana/network";

interface PaymentExplainerProps {
  /** Refund deadline formatted for the guest, once dates are picked. */
  deadline: string | null;
}

/**
 * The escrow guarantee in three lines. Each line is enforced by the program:
 * initialize moves the USDC into a program-owned account, cancel_booking
 * refunds the full amount before check-in, release_payment pays the host
 * only from check-in.
 */
const PaymentExplainer = ({ deadline }: PaymentExplainerProps) => {
  const headingId = useId();
  const lines = [
    <>
      Your USDC goes into an{" "}
      <a
        href={explorerUrl("address", idl.address)}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-foreground underline underline-offset-2 hover:decoration-2"
      >
        escrow account
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      , not to the host.
    </>,
    <>
      Cancel before check-in
      {deadline ? (
        <>
          {" "}
          (<span className="font-medium text-foreground">{deadline}</span>)
        </>
      ) : null}{" "}
      for a full refund.
    </>,
    <>The host can collect the payment only from check-in.</>,
  ];

  return (
    <section
      aria-labelledby={headingId}
      className="mt-4 rounded-lg border bg-background p-4"
    >
      <h3
        id={headingId}
        className="flex items-center gap-2 text-sm font-semibold"
      >
        <ShieldCheck aria-hidden="true" className="size-4 text-emerald-700" />
        How payment works
      </h3>
      <ol className="mt-3 space-y-2 text-sm text-foreground">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-2.5">
            <span
              aria-hidden="true"
              className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold text-foreground ring-1 ring-input"
            >
              {i + 1}
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default PaymentExplainer;
