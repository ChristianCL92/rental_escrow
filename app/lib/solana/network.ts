import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";

/**
 * Reads the Solana cluster from NEXT_PUBLIC_SOLANA_NETWORK. Unset means
 * devnet, which is where the escrow program is deployed today. An unknown
 * value throws, so a typo cannot silently point real guests at the wrong
 * cluster.
 */
export const parseNetwork = (
  value: string | undefined,
): WalletAdapterNetwork => {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case undefined:
    case "":
    case "devnet":
      return WalletAdapterNetwork.Devnet;
    case "testnet":
      return WalletAdapterNetwork.Testnet;
    case "mainnet":
    case "mainnet-beta":
      return WalletAdapterNetwork.Mainnet;
    default:
      throw new Error(
        `Unknown NEXT_PUBLIC_SOLANA_NETWORK "${value}". Use devnet, testnet or mainnet-beta.`,
      );
  }
};

export const SOLANA_NETWORK = parseNetwork(
  process.env.NEXT_PUBLIC_SOLANA_NETWORK,
);

/** RPC endpoint: NEXT_PUBLIC_SOLANA_RPC_URL if set, else the public cluster URL. */
export const resolveRpcEndpoint = (
  network: WalletAdapterNetwork,
  override: string | undefined,
): string => override?.trim() || clusterApiUrl(network);

export const SOLANA_RPC_ENDPOINT = resolveRpcEndpoint(
  SOLANA_NETWORK,
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
);

/** Devnet and testnet tokens have no value; guests must be told so. */
export const isTestNetwork = (network: WalletAdapterNetwork): boolean =>
  network !== WalletAdapterNetwork.Mainnet;

export const explorerUrl = (
  kind: "tx" | "address",
  id: string,
  network: WalletAdapterNetwork = SOLANA_NETWORK,
): string => {
  const base = `https://explorer.solana.com/${kind}/${id}`;
  return network === WalletAdapterNetwork.Mainnet
    ? base
    : `${base}?cluster=${network}`;
};
