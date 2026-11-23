/**
 * Test doubles for the booking server code: an in-memory bookings table
 * with the same overlap rule as supabase/schema.sql, an in-memory auth
 * store, and a mocked Solana RPC that serves real, signed transactions.
 * Used by the *.test.ts files only.
 */
import { BN, BorshCoder, type Idl } from "@coral-xyz/anchor";
import { ed25519 } from "@noble/curves/ed25519";
import {
  AccountInfo,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import idl from "@/lib/idl/rental_escrow.json";
import {
  AuthFields,
  buildAuthMessage,
  SignedAction,
  SignedAuth,
  toBase64,
} from "@/lib/booking/auth-message";
import { rentTimeForDay } from "@/lib/booking/escrow";
import type { Stay } from "@/lib/booking/limits";
import { escrowAddress, PROGRAM_ID } from "@/lib/solana/escrow-account";
import type { AuthStore } from "./auth-store";
import type { ServiceDeps } from "./booking-service";
import {
  BookingRow,
  BookingsRepo,
  BookingStatus,
  NewBooking,
  OverlapError,
} from "./bookings-repo";
import { createEscrowChain, RpcConnection } from "./chain";
import { stayAmount } from "./escrow-proof";

export const NOW = Date.parse("2026-11-23T12:00:00.000Z");

export class Clock {
  constructor(public now = NOW) {}
  advance(ms: number) {
    this.now += ms;
  }
}

export const memoryAuthStore = (clock: Clock) => {
  const entries = new Map<string, { value: string; expires: number }>();
  const live = (key: string) => {
    const entry = entries.get(key);
    return entry && entry.expires > clock.now ? entry : undefined;
  };
  const store: AuthStore & { failing: boolean } = {
    failing: false,
    claimOnce: async (key, ttlMs) => {
      if (store.failing) throw new Error("store down");
      if (live(key)) return false;
      entries.set(key, { value: "1", expires: clock.now + ttlMs });
      return true;
    },
    put: async (key, value, ttlMs) => {
      if (store.failing) throw new Error("store down");
      entries.set(key, { value, expires: clock.now + ttlMs });
    },
    get: async (key) => {
      if (store.failing) throw new Error("store down");
      return live(key)?.value ?? null;
    },
  };
  return store;
};

const ACTIVE: BookingStatus[] = ["pending", "confirmed"];

/**
 * The bookings table; the overlap rule ignores cancelled rows, as the live
 * constraint does (`where (status <> 'cancelled')`).
 */
export const memoryRepo = (clock: Clock) => {
  const rows = new Map<string, BookingRow>();
  let next = 1;
  const all = () => [...rows.values()];
  const overlaps = (
    row: BookingRow,
    apartmentId: number,
    i: string,
    o: string,
  ) =>
    row.apartment_id === apartmentId &&
    row.check_in_date < o &&
    row.check_out_date > i;

  const repo: BookingsRepo & {
    rows: Map<string, BookingRow>;
    seed: (row: Partial<BookingRow> & NewBooking) => BookingRow;
  } = {
    rows,
    seed: (row) => {
      const iso = new Date(clock.now).toISOString();
      const id = `00000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
      const full: BookingRow = {
        id,
        tx_signature: null,
        created_at: iso,
        updated_at: iso,
        ...row,
      };
      rows.set(full.id, full);
      return full;
    },
    activeOverlapping: async (apartmentId, checkIn, checkOut) =>
      all().filter(
        (row) =>
          ACTIVE.includes(row.status) &&
          overlaps(row, apartmentId, checkIn, checkOut),
      ),
    activeForApartment: async (apartmentId) =>
      all().filter(
        (row) =>
          row.apartment_id === apartmentId && ACTIVE.includes(row.status),
      ),
    pendingForGuest: async (wallet) =>
      all().filter(
        (row) => row.guest_wallet === wallet && row.status === "pending",
      ),
    activeStay: async (wallet, apartmentId, checkIn) =>
      all().find(
        (row) =>
          row.guest_wallet === wallet &&
          row.apartment_id === apartmentId &&
          row.check_in_date === checkIn &&
          ACTIVE.includes(row.status),
      ) ?? null,
    forGuest: async (wallet) =>
      all().filter((row) => row.guest_wallet === wallet),
    byId: async (id) => rows.get(id) ?? null,
    insert: async (booking) => {
      if (
        all().some(
          (row) =>
            row.status !== "cancelled" &&
            overlaps(
              row,
              booking.apartment_id,
              booking.check_in_date,
              booking.check_out_date,
            ),
        )
      ) {
        throw new OverlapError();
      }
      return repo.seed(booking);
    },
    setStatus: async (id, from, status, txSignature) => {
      const row = rows.get(id);
      if (!row || !from.includes(row.status)) return null;
      const updated = {
        ...row,
        status,
        tx_signature: txSignature ?? row.tx_signature,
        updated_at: new Date(clock.now).toISOString(),
      };
      rows.set(id, updated);
      return updated;
    },
    deletePending: async (id, createdBefore) => {
      const row = rows.get(id);
      if (!row || row.status !== "pending") return false;
      if (createdBefore && row.created_at > createdBefore) return false;
      return rows.delete(id);
    },
  };
  return repo;
};

const coder = new BorshCoder(idl as Idl);
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const OWNER = new PublicKey("BFkaEmBxMfN3vcrmhzo1y86K4AHXi69eZPVE15bgs9xs");

export interface PaymentOptions {
  amount?: bigint;
  rentTime?: number;
  apartmentId?: number;
  failed?: boolean;
  /** Write the escrow account too (the payment landed). Default true. */
  createAccount?: boolean;
}

/**
 * A mocked devnet RPC. `pay` builds and signs a real `initialize`
 * transaction, as the browser does, and serves it from getTransaction; the
 * escrow account it creates is served from getMultipleAccountsInfo.
 */
export class FakeRpc implements RpcConnection {
  accounts = new Map<string, AccountInfo<Buffer>>();
  transactions = new Map<string, VersionedTransactionResponse>();
  failing = false;
  calls: string[] = [];
  /** getTransaction answers null this many times before the real answer. */
  lag = 0;
  private accountLag = 0;
  private laggedAccounts = new Map<string, AccountInfo<Buffer>>();

  /**
   * The next `reads` getMultipleAccountsInfo calls answer from `snapshot`
   * (by default, the accounts as they are now), like a node lagging behind.
   */
  lagAccounts(reads: number, snapshot = new Map(this.accounts)) {
    this.accountLag = reads;
    this.laggedAccounts = snapshot;
  }

  getMultipleAccountsInfo: RpcConnection["getMultipleAccountsInfo"] = async (
    keys,
  ) => {
    this.calls.push("getMultipleAccountsInfo");
    if (this.failing) throw new Error("RPC unavailable");
    const accounts = this.accountLag > 0 ? this.laggedAccounts : this.accounts;
    if (this.accountLag > 0) this.accountLag -= 1;
    return keys.map((key) => accounts.get(key.toBase58()) ?? null);
  };

  getTransaction = (async (signature: string) => {
    this.calls.push("getTransaction");
    if (this.failing) throw new Error("RPC unavailable");
    if (this.lag > 0) {
      this.lag -= 1;
      return null;
    }
    return this.transactions.get(signature) ?? null;
  }) as RpcConnection["getTransaction"];

  /** Pays for `stay` from `guest`; returns the transaction signature. */
  pay(guest: Keypair, stay: Stay, options: PaymentOptions = {}): string {
    const apartmentId = options.apartmentId ?? stay.apartmentId;
    const amount = options.amount ?? stayAmount(stay)!;
    const rentTime = options.rentTime ?? rentTimeForDay(stay.checkInDate);
    const escrow = escrowAddress(guest.publicKey, apartmentId);
    const keys = [
      escrow,
      Keypair.generate().publicKey, // escrow token account
      Keypair.generate().publicKey, // guest token account
      guest.publicKey,
      USDC_MINT,
      OWNER,
      TOKEN_PROGRAM_ID,
      SystemProgram.programId,
    ];
    const signerIndex = 3;
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: keys.map((pubkey, i) => ({
        pubkey,
        isSigner: i === signerIndex,
        isWritable: i < 4,
      })),
      data: coder.instruction.encode("initialize", {
        apartment_id: new BN(apartmentId),
        amount: new BN(amount.toString()),
        rent_time: new BN(rentTime),
      }),
    });
    const tx = new Transaction({
      feePayer: guest.publicKey,
      blockhash: "11111111111111111111111111111111",
      lastValidBlockHeight: 1000,
    }).add(ix);
    tx.sign(guest);
    const signature = bs58(tx.signature!);
    this.transactions.set(signature, {
      slot: 100,
      blockTime: null,
      transaction: { message: tx.compileMessage(), signatures: [signature] },
      meta: {
        err: options.failed ? { InstructionError: [0, "Custom"] } : null,
        fee: 5000,
        preBalances: [],
        postBalances: [],
        loadedAddresses: { writable: [], readonly: [] },
      },
      version: "legacy",
    } as unknown as VersionedTransactionResponse);

    if (!options.failed && options.createAccount !== false) {
      this.openEscrow(guest.publicKey, apartmentId, amount, rentTime);
    }
    return signature;
  }

  openEscrow(
    guest: PublicKey,
    apartmentId: number,
    amount: bigint,
    rentTime: number,
  ) {
    const data = encodeEscrow(guest, apartmentId, amount, rentTime);
    this.accounts.set(escrowAddress(guest, apartmentId).toBase58(), {
      data,
      executable: false,
      lamports: 2_000_000,
      owner: PROGRAM_ID,
      rentEpoch: 0,
    });
  }

  closeEscrow(guest: PublicKey, apartmentId: number) {
    this.accounts.delete(escrowAddress(guest, apartmentId).toBase58());
  }
}

const encodeEscrow = (
  guest: PublicKey,
  apartmentId: number,
  amount: bigint,
  rentTime: number,
): Buffer => {
  // BorshAccountsCoder.encode is async; build the bytes synchronously.
  const data = Buffer.alloc(162);
  Buffer.from(idl.accounts[0].discriminator).copy(data, 0);
  data.writeBigUInt64LE(BigInt(apartmentId), 8);
  data.writeBigUInt64LE(amount, 16);
  OWNER.toBuffer().copy(data, 24);
  guest.toBuffer().copy(data, 56);
  data.writeBigUInt64LE(BigInt(rentTime), 88);
  return data;
};

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const bs58 = (bytes: Uint8Array): string => {
  let value = BigInt("0x" + (Buffer.from(bytes).toString("hex") || "0"));
  let out = "";
  while (value > BigInt(0)) {
    out = ALPHABET[Number(value % BigInt(58))] + out;
    value /= BigInt(58);
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = "1" + out;
  }
  return out;
};

/** Signs a booking message the way the guest's wallet does. */
export const signAs = (
  signer: Keypair,
  action: SignedAction,
  fields: Pick<AuthFields, "apartmentId" | "checkInDate" | "checkOutDate"> = {},
  {
    issuedAt = new Date(NOW).toISOString(),
    wallet = signer.publicKey.toBase58(),
    nonce = "0123456789abcdef0123456789abcdef",
  }: { issuedAt?: string; wallet?: string; nonce?: string } = {},
): SignedAuth => {
  const message = buildAuthMessage({
    action,
    ...fields,
    wallet,
    issuedAt,
    nonce,
  });
  const signature = ed25519.sign(
    new TextEncoder().encode(message),
    signer.secretKey.slice(0, 32),
  );
  return { wallet, issuedAt, nonce, signature: toBase64(signature) };
};

export const setup = () => {
  const clock = new Clock();
  const repo = memoryRepo(clock);
  const store = memoryAuthStore(clock);
  const rpc = new FakeRpc();
  const chain = createEscrowChain(rpc);
  const deps: ServiceDeps = {
    repo: () => repo,
    chain: () => chain,
    store: () => store,
    now: () => clock.now,
    sleep: async () => {},
    openEscrows: new Map(),
  };
  return { clock, repo, store, rpc, chain, deps };
};

/** Two nights, a week after NOW. */
export const STAY: Stay = {
  apartmentId: 1,
  checkInDate: "2026-11-30",
  checkOutDate: "2026-12-02",
};
