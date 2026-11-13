import { describe, expect, it } from "bun:test";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
  explorerUrl,
  isTestNetwork,
  parseNetwork,
  resolveRpcEndpoint,
} from "./network";
import { shortenAddress } from "./address";

describe("parseNetwork", () => {
  it("defaults to devnet, where the program is deployed", () => {
    expect(parseNetwork(undefined)).toBe(WalletAdapterNetwork.Devnet);
    expect(parseNetwork("")).toBe(WalletAdapterNetwork.Devnet);
  });

  it("accepts the cluster names, case-insensitively", () => {
    expect(parseNetwork("Testnet")).toBe(WalletAdapterNetwork.Testnet);
    expect(parseNetwork(" mainnet-beta ")).toBe(WalletAdapterNetwork.Mainnet);
    expect(parseNetwork("mainnet")).toBe(WalletAdapterNetwork.Mainnet);
  });

  it("refuses an unknown network instead of guessing", () => {
    expect(() => parseNetwork("mainet")).toThrow(/NEXT_PUBLIC_SOLANA_NETWORK/);
  });
});

describe("isTestNetwork", () => {
  it("flags devnet and testnet, not mainnet", () => {
    expect(isTestNetwork(WalletAdapterNetwork.Devnet)).toBe(true);
    expect(isTestNetwork(WalletAdapterNetwork.Testnet)).toBe(true);
    expect(isTestNetwork(WalletAdapterNetwork.Mainnet)).toBe(false);
  });
});

describe("resolveRpcEndpoint", () => {
  it("uses the public cluster URL unless overridden", () => {
    expect(resolveRpcEndpoint(WalletAdapterNetwork.Devnet, undefined)).toBe(
      "https://api.devnet.solana.com",
    );
    expect(
      resolveRpcEndpoint(WalletAdapterNetwork.Devnet, "http://127.0.0.1:8899"),
    ).toBe("http://127.0.0.1:8899");
  });
});

describe("explorerUrl", () => {
  it("adds the cluster on test networks only", () => {
    expect(explorerUrl("tx", "abc", WalletAdapterNetwork.Devnet)).toBe(
      "https://explorer.solana.com/tx/abc?cluster=devnet",
    );
    expect(explorerUrl("address", "xyz", WalletAdapterNetwork.Mainnet)).toBe(
      "https://explorer.solana.com/address/xyz",
    );
  });
});

describe("shortenAddress", () => {
  it("keeps the first and last four characters", () => {
    expect(shortenAddress("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")).toBe(
      "4zMM…ncDU",
    );
  });

  it("leaves short strings alone", () => {
    expect(shortenAddress("abc")).toBe("abc");
  });
});
