"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  LogOut,
} from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortenAddress } from "@/lib/solana/address";
import ConnectWalletButton from "./ConnectWalletButton";

/**
 * The nav's wallet control: "Connect wallet" when disconnected; once
 * connected, the shortened address with a menu holding My Bookings and the
 * wallet actions.
 */
const WalletMenu = () => {
  const { publicKey, wallet, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!connected || !publicKey) {
    return <ConnectWalletButton variant="secondary" />;
  }

  const address = publicKey.toBase58();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          className="cursor-pointer font-mono tabular-nums"
          data-testid="wallet-menu-trigger"
        >
          {wallet?.adapter.icon && (
            // Wallet icons are data URIs supplied by the wallet itself.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={wallet.adapter.icon}
              alt=""
              className="size-4 rounded-sm"
            />
          )}
          <span className="sr-only">Wallet </span>
          {shortenAddress(address)}
          <ChevronDown aria-hidden="true" className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          Connected with {wallet?.adapter.name ?? "your wallet"}
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/bookings">
            <CalendarDays aria-hidden="true" />
            My Bookings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void navigator.clipboard?.writeText(address).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? (
            <Check aria-hidden="true" className="text-emerald-700" />
          ) : (
            <Copy aria-hidden="true" />
          )}
          <span aria-live="polite">
            {copied ? "Address copied" : "Copy address"}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setVisible(true)}>
          <ArrowLeftRight aria-hidden="true" />
          Change wallet
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void disconnect()}>
          <LogOut aria-hidden="true" />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default WalletMenu;
