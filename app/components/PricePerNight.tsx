import { formatUsdc } from "@/lib/money";
import { cn } from "@/lib/utils";

interface PricePerNightProps {
  amount: number;
  className?: string;
  /** Sizes the amount; the muted "/ night" stays at the surrounding size. */
  amountClassName?: string;
}

/**
 * A nightly price, the same way everywhere: the amount in bold ink and a
 * muted "/ night" after it, for example "30 USDC / night".
 */
const PricePerNight = ({
  amount,
  className,
  amountClassName,
}: PricePerNightProps) => (
  <p className={cn("whitespace-nowrap text-muted-foreground", className)}>
    <span className={cn("font-bold text-foreground", amountClassName)}>
      {formatUsdc(amount)}
    </span>{" "}
    / night
  </p>
);

export default PricePerNight;
