"use client";
import { ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SOLANA_RPC_ENDPOINT } from "@/lib/solana/network";
import "@solana/wallet-adapter-react-ui/styles.css";

interface SolanaProviderProps {
  children: ReactNode;
}

// Wallets register themselves through the Wallet Standard (Phantom, Solflare,
// Backpack, ...), so no adapters are listed here.
const WALLETS: never[] = [];

const SolanaWalletProvider = ({ children }: SolanaProviderProps) => {
  return (
    <ConnectionProvider endpoint={SOLANA_RPC_ENDPOINT}>
      <WalletProvider wallets={WALLETS} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default SolanaWalletProvider;
