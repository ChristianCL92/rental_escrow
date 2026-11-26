import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { IS_TEST_NETWORK, SOLANA_NETWORK } from "@/lib/solana/network";

export const TEST_NETWORK_LABEL = "Test network - no real money";

interface NetworkBadgeProps {
  /** "pill" sits inline; "strip" spans the full width (the phone nav). */
  variant?: "pill" | "strip";
  /**
   * The ground it sits on. On the dark nav it takes the logo-sun highlight;
   * the highlight is never used on light grounds, so there it uses the
   * warning tint instead.
   */
  ground?: "dark" | "light";
  className?: string;
}

/**
 * Tells guests the app runs on a Solana test cluster, where USDC and SOL
 * have no value. Renders nothing on mainnet, so it disappears at launch.
 */
const NetworkBadge = ({
  variant = "pill",
  ground = "light",
  className,
}: NetworkBadgeProps) => {
  if (!IS_TEST_NETWORK) return null;

  return (
    <p
      data-testid="network-badge"
      title={`This app runs on Solana ${SOLANA_NETWORK}. Tokens here have no value.`}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 text-xs font-semibold",
        ground === "dark"
          ? "bg-highlight text-highlight-foreground"
          : "bg-amber-50 text-amber-950 ring-1 ring-amber-200 ring-inset",
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
