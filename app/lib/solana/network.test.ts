import { describe, expect, it } from "bun:test";
import { explorerUrl, SOLANA_RPC_ENDPOINT } from "./network";
import { shortenAddress } from "./address";

describe("network", () => {
  it("talks to the public devnet RPC, where the program is deployed", () => {
    expect(SOLANA_RPC_ENDPOINT).toBe("https://api.devnet.solana.com");
  });
});

describe("explorerUrl", () => {
  it("points the explorer at devnet", () => {
    expect(explorerUrl("tx", "abc")).toBe(
      "https://explorer.solana.com/tx/abc?cluster=devnet",
    );
    expect(explorerUrl("address", "xyz")).toBe(
      "https://explorer.solana.com/address/xyz?cluster=devnet",
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
