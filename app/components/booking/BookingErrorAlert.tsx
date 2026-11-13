"use client";

import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { FriendlyError } from "@/lib/booking/errors";
import { isTestNetwork, SOLANA_NETWORK } from "@/lib/solana/network";
import { cn } from "@/lib/utils";
import DismissButton from "./DismissButton";
import ErrorDetails from "./ErrorDetails";

const linkClass =
  "font-semibold underline underline-offset-2 hover:decoration-2";

const ExternalLink = ({
  href,
  children,
}: {
  href: string;
  children: string;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={linkClass}
  >
    {children}
    <span className="sr-only"> (opens in a new tab)</span>
  </a>
);

const ErrorAction = ({ action }: { action: FriendlyError["action"] }) => {
  const { setVisible } = useWalletModal();
  const testNetwork = isTestNetwork(SOLANA_NETWORK);

  switch (action) {
    case "my-bookings":
      return (
        <Link href="/bookings" className={linkClass}>
          Go to My Bookings
        </Link>
      );
    case "get-sol":
      return testNetwork ? (
        <ExternalLink href="https://faucet.solana.com">
          Get free test SOL
        </ExternalLink>
      ) : null;
    case "get-usdc":
      return testNetwork ? (
        <ExternalLink href="https://faucet.circle.com">
          Get free test USDC
        </ExternalLink>
      ) : null;
    case "reconnect":
      return (
        <button
          type="button"
          onClick={() => setVisible(true)}
          className={cn(linkClass, "cursor-pointer")}
        >
          Connect wallet
        </button>
      );
    default:
      return null;
  }
};

interface BookingErrorAlertProps {
  error: FriendlyError;
  onDismiss?: () => void;
  className?: string;
}

/** A plain-language error, announced to screen readers (role="alert"). */
const BookingErrorAlert = ({
  error,
  onDismiss,
  className,
}: BookingErrorAlertProps) => (
  <Alert
    variant="destructive"
    className={cn(onDismiss && "pr-10", className)}
    data-testid="booking-error"
  >
    <CircleAlert aria-hidden="true" />
    <AlertTitle className="line-clamp-none font-semibold">
      {error.title}
    </AlertTitle>
    <AlertDescription>
      <p>{error.message}</p>
      <ErrorAction action={error.action} />
      <ErrorDetails detail={error.detail} />
    </AlertDescription>
    {onDismiss && <DismissButton onClick={onDismiss} />}
  </Alert>
);

export default BookingErrorAlert;
