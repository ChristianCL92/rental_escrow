import { Connection, PublicKey } from "@solana/web3.js";
import { SOLANA_RPC_ENDPOINT } from "@/lib/solana/network";

/**
 * The slice of the Solana RPC the booking routes read. Kept small so tests
 * can stand in for the network, and mapped from web3.js here so the rest of
 * the server code works with plain values.
 */

export interface ChainAccount {
  owner: string;
  data: Uint8Array;
}

export interface ChainInstruction {
  programId: string;
  accounts: string[];
  data: Uint8Array;
}

export interface ChainTransaction {
  failed: boolean;
  /** Addresses that signed the transaction. */
  signers: string[];
  /** Top-level instructions, in order. */
  instructions: ChainInstruction[];
}

export interface EscrowChain {
  getAccounts(addresses: PublicKey[]): Promise<(ChainAccount | null)[]>;
  getTransaction(signature: string): Promise<ChainTransaction | null>;
}

export type RpcConnection = Pick<
  Connection,
  "getMultipleAccountsInfo" | "getTransaction"
>;

/** getMultipleAccounts takes at most 100 addresses per call. */
const ACCOUNTS_PER_CALL = 100;

export const createEscrowChain = (
  connection: RpcConnection = new Connection(SOLANA_RPC_ENDPOINT, "confirmed"),
): EscrowChain => ({
  getAccounts: async (addresses) => {
    const results: (ChainAccount | null)[] = [];
    for (let i = 0; i < addresses.length; i += ACCOUNTS_PER_CALL) {
      const infos = await connection.getMultipleAccountsInfo(
        addresses.slice(i, i + ACCOUNTS_PER_CALL),
        "confirmed",
      );
      results.push(
        ...infos.map((info) =>
          info ? { owner: info.owner.toBase58(), data: info.data } : null,
        ),
      );
    }
    return results;
  },

  getTransaction: async (signature) => {
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx) return null;
    const message = tx.transaction.message;
    const keys = message
      .getAccountKeys({
        accountKeysFromLookups: tx.meta?.loadedAddresses,
      })
      .keySegments()
      .flat()
      .map((key) => key.toBase58());
    return {
      failed: !tx.meta || tx.meta.err !== null,
      signers: keys.slice(0, message.header.numRequiredSignatures),
      instructions: message.compiledInstructions.map((ix) => ({
        programId: keys[ix.programIdIndex],
        accounts: ix.accountKeyIndexes.map((index) => keys[index]),
        data: ix.data,
      })),
    };
  },
});
