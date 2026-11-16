"use client";

import { useSyncExternalStore } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};

/** False during server render and hydration, true afterwards. */
const useHydrated = () =>
  useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

const WalletLink = ({ href, children }: { href: string; children: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="font-medium text-foreground underline underline-offset-2 hover:decoration-2"
  >
    {children}
    <span className="sr-only"> (opens in a new tab)</span>
  </a>
);

/**
 * Shown only when no Solana wallet is installed in this browser, so a guest
 * without one is not left at the wallet picker's dead end.
 */
const WalletHelp = ({ className }: { className?: string }) => {
  const { wallets } = useWallet();
  const hydrated = useHydrated();

  // Wallets register after hydration; waiting avoids flashing the hint at
  // guests who do have one.
  if (!hydrated) return null;
  if (wallets.some((w) => w.readyState === WalletReadyState.Installed)) {
    return null;
  }

  return (
    <p
      className={cn("text-sm text-muted-foreground", className)}
      data-testid="wallet-help"
    >
      New to crypto wallets?{" "}
      <WalletLink href="https://phantom.com/download">Phantom</WalletLink> or{" "}
      <WalletLink href="https://solflare.com/download">Solflare</WalletLink>{" "}
      take two minutes to set up.
    </p>
  );
};

export default WalletHelp;
