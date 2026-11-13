import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTestNetwork, SOLANA_NETWORK } from "@/lib/solana/network";

export const TEST_NETWORK_LABEL = "Test network - no real money";

interface NetworkBadgeProps {
  /** "pill" sits inline; "strip" spans the full width (the phone nav). */
  variant?: "pill" | "strip";
  className?: string;
}

/**
 * Tells guests the app runs on a Solana test cluster, where USDC and SOL
 * have no value. Renders nothing on mainnet, so it disappears at launch.
 */
const NetworkBadge = ({ variant = "pill", className }: NetworkBadgeProps) => {
  if (!isTestNetwork(SOLANA_NETWORK)) return null;

  return (
    <p
      data-testid="network-badge"
      title={`This app runs on Solana ${SOLANA_NETWORK}. Tokens here have no value.`}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 bg-amber-300 text-xs font-semibold text-amber-950",
        variant === "pill"
          ? "w-fit shrink-0 rounded-full px-2.5 py-1"
          : "w-full px-4 py-1",
        className,
      )}
    >
      <FlaskConical aria-hidden="true" className="size-3.5" />
      {TEST_NETWORK_LABEL}
    </p>
  );
};

export default NetworkBadge;
