import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";

/**
 * The Solana cluster the escrow program is deployed to. The wallet provider,
 * explorer links and the "Test network" badge all read this one constant.
 */
export const SOLANA_NETWORK =
  WalletAdapterNetwork.Devnet as WalletAdapterNetwork;

export const SOLANA_RPC_ENDPOINT = clusterApiUrl(SOLANA_NETWORK);

/** Off mainnet, USDC and SOL have no value; guests must be told so. */
export const IS_TEST_NETWORK = SOLANA_NETWORK !== WalletAdapterNetwork.Mainnet;

export const explorerUrl = (kind: "tx" | "address", id: string): string =>
  `https://explorer.solana.com/${kind}/${id}?cluster=${SOLANA_NETWORK}`;
