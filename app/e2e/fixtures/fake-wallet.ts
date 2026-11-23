import type { Page } from "@playwright/test";

/**
 * A Wallet Standard wallet ("Test Wallet") injected into the page, so the
 * connected and paying states can be driven without a browser extension.
 * It holds a real Ed25519 key (WebCrypto) and really signs, because web3.js
 * verifies signatures before sending and the server verifies signed
 * messages.
 *
 * Control it from a test through `window.__fakeWallet`:
 * - mode "approve" signs at once, "reject" refuses like a user would, and
 *   "hold" waits until `release(true | false)` so a test can look at the
 *   page while the wallet prompt is "open";
 * - `prompts` counts signature requests (transactions and messages);
 * - `messages` lists the text of every message it was asked to sign.
 *
 * Install it with `signMessage: false` to act like a wallet that can sign
 * transactions but not messages.
 */
export type FakeWalletMode = "approve" | "reject" | "hold";

export interface FakeWalletOptions {
  mode: FakeWalletMode;
  signMessage: boolean;
}

export interface FakeWalletControl {
  mode: FakeWalletMode;
  prompts: number;
  messages: string[];
  address: string | null;
  pending: number;
  release: (approve: boolean) => void;
}

declare global {
  interface Window {
    __fakeWallet: FakeWalletControl;
  }
}

/** Runs in the browser; must be self-contained. */
export function fakeWalletScript({
  mode: initialMode,
  signMessage: canSignMessages,
}: FakeWalletOptions) {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const toBase58 = (bytes: Uint8Array) => {
    const digits = [0];
    for (const byte of bytes) {
      let carry = byte;
      for (let i = 0; i < digits.length; i++) {
        carry += digits[i] << 8;
        digits[i] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry) {
        digits.push(carry % 58);
        carry = (carry / 58) | 0;
      }
    }
    let out = "";
    for (const byte of bytes) {
      if (byte !== 0) break;
      out += "1";
    }
    const allZero = digits.length === 1 && digits[0] === 0;
    if (!allZero) {
      for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
    }
    return out;
  };
  const readShortVec = (bytes: Uint8Array, offset: number) => {
    let value = 0;
    let size = 0;
    for (;;) {
      const byte = bytes[offset + size];
      value |= (byte & 0x7f) << (size * 7);
      size += 1;
      if ((byte & 0x80) === 0) break;
    }
    return { value, size };
  };

  const waiters: ((approve: boolean) => void)[] = [];
  const control = {
    mode: initialMode,
    prompts: 0,
    messages: [] as string[],
    address: null as string | null,
    get pending() {
      return waiters.length;
    },
    release(approve: boolean) {
      waiters.shift()?.(approve);
    },
  };
  (window as unknown as { __fakeWallet: typeof control }).__fakeWallet =
    control;

  const ICON =
    "data:image/svg+xml;base64," +
    btoa(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0f172a"/><circle cx="16" cy="16" r="7" fill="#fcd34d"/></svg>',
    );
  const CHAINS = [
    "solana:devnet",
    "solana:testnet",
    "solana:mainnet",
    "solana:localnet",
  ] as const;

  const register = async () => {
    // Like a real wallet, keep the same key across reloads of the tab.
    const STORED = "__fakeWalletKey";
    const loadKeys = async (): Promise<CryptoKeyPair | null> => {
      try {
        const saved = sessionStorage.getItem(STORED);
        if (!saved) return null;
        const { privateKey, publicKey } = JSON.parse(saved);
        return {
          privateKey: await crypto.subtle.importKey(
            "jwk",
            privateKey,
            { name: "Ed25519" },
            true,
            ["sign"],
          ),
          publicKey: await crypto.subtle.importKey(
            "jwk",
            publicKey,
            { name: "Ed25519" },
            true,
            ["verify"],
          ),
        };
      } catch {
        return null;
      }
    };
    let keys = await loadKeys();
    if (!keys) {
      keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
        "sign",
        "verify",
      ])) as CryptoKeyPair;
      try {
        sessionStorage.setItem(
          STORED,
          JSON.stringify({
            privateKey: await crypto.subtle.exportKey("jwk", keys.privateKey),
            publicKey: await crypto.subtle.exportKey("jwk", keys.publicKey),
          }),
        );
      } catch {
        // A fresh key per page load is fine for tests that do not reload.
      }
    }
    const keyPair = keys;
    const publicKey = new Uint8Array(
      await crypto.subtle.exportKey("raw", keyPair.publicKey),
    );
    const address = toBase58(publicKey);
    control.address = address;

    const account = {
      address,
      publicKey,
      chains: CHAINS,
      features: canSignMessages
        ? ["solana:signTransaction", "solana:signMessage"]
        : ["solana:signTransaction"],
    };
    let accounts: (typeof account)[] = [];
    const listeners = new Set<(props: { accounts: unknown }) => void>();
    const emitChange = () =>
      listeners.forEach((listener) => listener({ accounts }));

    const signOne = async ({ transaction }: { transaction: Uint8Array }) => {
      const sigCount = readShortVec(transaction, 0);
      const messageStart = sigCount.size + 64 * sigCount.value;
      const message = transaction.slice(messageStart);
      const header = message[0] & 0x80 ? 1 : 0;
      const required = message[header];
      const keyCount = readShortVec(message, header + 3);
      const keysStart = header + 3 + keyCount.size;
      let index = -1;
      for (let i = 0; i < required; i++) {
        const key = message.slice(keysStart + i * 32, keysStart + (i + 1) * 32);
        if (key.every((b, j) => b === publicKey[j])) index = i;
      }
      if (index < 0) throw new Error("Test Wallet is not a signer");
      const signature = new Uint8Array(
        await crypto.subtle.sign(
          { name: "Ed25519" },
          keyPair.privateKey,
          message,
        ),
      );
      const signed = transaction.slice();
      signed.set(signature, sigCount.size + 64 * index);
      return { signedTransaction: signed };
    };

    const decide = (): Promise<boolean> => {
      control.prompts += 1;
      if (control.mode === "approve") return Promise.resolve(true);
      if (control.mode === "reject") return Promise.resolve(false);
      return new Promise((resolve) => waiters.push(resolve));
    };

    const rejection = () =>
      Object.assign(new Error("User rejected the request."), { code: 4001 });

    const messageFeature = {
      "solana:signMessage": {
        version: "1.0.0",
        signMessage: async (...inputs: { message: Uint8Array }[]) => {
          control.messages.push(
            ...inputs.map(({ message }) => new TextDecoder().decode(message)),
          );
          if (!(await decide())) throw rejection();
          return Promise.all(
            inputs.map(async ({ message }) => ({
              signedMessage: message,
              signature: new Uint8Array(
                await crypto.subtle.sign(
                  { name: "Ed25519" },
                  keyPair.privateKey,
                  new Uint8Array(message),
                ),
              ),
            })),
          );
        },
      },
    };

    const wallet = {
      version: "1.0.0" as const,
      name: "Test Wallet",
      icon: ICON,
      chains: CHAINS,
      get accounts() {
        return accounts;
      },
      features: {
        "standard:connect": {
          version: "1.0.0",
          connect: async () => {
            accounts = [account];
            emitChange();
            return { accounts };
          },
        },
        "standard:disconnect": {
          version: "1.0.0",
          disconnect: async () => {
            accounts = [];
            emitChange();
          },
        },
        "standard:events": {
          version: "1.0.0",
          on: (
            _event: string,
            listener: (props: { accounts: unknown }) => void,
          ) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
        "solana:signTransaction": {
          version: "1.0.0",
          supportedTransactionVersions: ["legacy", 0],
          signTransaction: async (...inputs: { transaction: Uint8Array }[]) => {
            if (!(await decide())) throw rejection();
            return Promise.all(inputs.map(signOne));
          },
        },
        ...(canSignMessages ? messageFeature : {}),
      },
    };

    const callback = ({ register }: { register: (w: unknown) => void }) =>
      register(wallet);
    window.dispatchEvent(
      new CustomEvent("wallet-standard:register-wallet", { detail: callback }),
    );
    window.addEventListener("wallet-standard:app-ready", (event) =>
      callback((event as CustomEvent).detail),
    );
  };

  void register();
}

export const installFakeWallet = async (
  page: Page,
  mode: FakeWalletMode = "approve",
  { signMessage = true }: { signMessage?: boolean } = {},
) => {
  await page.addInitScript(fakeWalletScript, { mode, signMessage });
};

export const setWalletMode = (page: Page, mode: FakeWalletMode) =>
  page.evaluate((m) => {
    window.__fakeWallet.mode = m;
  }, mode);

/** Waits for the wallet prompt to be "open", then answers it. */
export const answerWalletPrompt = async (page: Page, approve: boolean) => {
  await page.waitForFunction(() => window.__fakeWallet.pending > 0);
  await page.evaluate((a) => window.__fakeWallet.release(a), approve);
};
