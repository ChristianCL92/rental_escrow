"use client";

import { ComponentProps } from "react";
import { Wallet } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConnectWalletButtonProps = Omit<
  ComponentProps<typeof Button>,
  "onClick" | "children"
> & {
  label?: string;
};

/** Opens the wallet picker. */
const ConnectWalletButton = ({
  label = "Connect wallet",
  className,
  disabled,
  ...props
}: ConnectWalletButtonProps) => {
  const { connecting } = useWallet();
  const { setVisible } = useWalletModal();

  return (
    <Button
      type="button"
      {...props}
      className={cn("cursor-pointer", className)}
      disabled={disabled || connecting}
      onClick={() => setVisible(true)}
    >
      <Wallet aria-hidden="true" />
      {connecting ? "Connecting..." : label}
    </Button>
  );
};

export default ConnectWalletButton;
