import type { Page, Request } from "@playwright/test";
import { PublicKey } from "@solana/web3.js";
import idl from "../../lib/idl/rental_escrow.json";

/**
 * Mocks for everything the booking flow talks to: the Solana devnet RPC
 * (HTTP and WebSocket) and the app's /api/bookings routes. Tests flip the
 * fields of the state object to steer the flow and read `calls` back.
 */
export interface MockState {
  /** An escrow for this guest and room already exists on-chain. */
  existingEscrow: boolean;
  /** Result of POST /api/bookings/availability. */
  available: boolean;
  /** Status of POST /api/bookings (409 = double booking). */
  createStatus: 201 | 409;
  /** Status of GET /api/bookings/booked-dates. */
  bookedDatesStatus: 200 | 500;
  bookedDates: { check_in_date: string; check_out_date: string }[];
  /** When set, the program holds one upcoming escrow for this guest. */
  escrowGuest: string | null;
  /** Every mocked call, as "METHOD path" or "rpc:method". */
  calls: string[];
  /** Full URLs of every mocked /api request, query included. */
  urls: string[];
  /** Every mocked /api request with its JSON body and auth header. */
  requests: ApiRequest[];
  /** Status of POST /api/bookings/session (sign in to My Bookings). */
  sessionStatus: 201 | 401;
  /** Signatures of transactions sent to the RPC, in order. */
  sent: string[];
  /**
   * The network drops while the payment (second) transaction is sent. While
   * the app then waits for the payment, the escrow appears on the second
   * check ("lands-late"), the chain passes the payment's last valid block
   * height with no escrow ("never-lands"), or every check fails
   * ("checks-fail").
   */
  paymentSendFails: false | "lands-late" | "never-lands" | "checks-fail";
  /** Set once the payment send has been dropped. */
  paymentSendAborted: boolean;
  /** Block height checks made after the payment send was dropped. */
  settleChecks: number;
}

export interface ApiRequest {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  authorization: string | null;
}

/** The token the mocked sign-in hands out. */
export const SESSION_TOKEN = "test-session-token-0123456789";

export const createMockState = (
  overrides: Partial<MockState> = {},
): MockState => ({
  existingEscrow: false,
  available: true,
  createStatus: 201,
  bookedDatesStatus: 200,
  bookedDates: [],
  escrowGuest: null,
  calls: [],
  urls: [],
  requests: [],
  sessionStatus: 201,
  sent: [],
  paymentSendFails: false,
  paymentSendAborted: false,
  settleChecks: 0,
  ...overrides,
});

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const toBase58 = (bytes: Uint8Array): string => {
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

/** The first signature of a base64 wire transaction, base58-encoded. */
const firstSignature = (base64Tx: string): string =>
  toBase58(Buffer.from(base64Tx, "base64").subarray(1, 65));

/** lastValidBlockHeight of the mocked blockhash. */
const LAST_VALID_BLOCK_HEIGHT = 1_000;

/** Upcoming checkIn for the mocked escrow: two months ahead, UTC midnight. */
export const ESCROW_CHECK_IN = (() => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 10));
})();

/** An EscrowAccount as the program stores it (see programs/.../state.rs). */
const escrowAccount = (guestAddress: string) => {
  const guest = new PublicKey(guestAddress);
  const apartmentId = Buffer.alloc(8);
  apartmentId.writeBigUInt64LE(BigInt(1));
  const [pubkey] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), guest.toBuffer(), apartmentId],
    new PublicKey(idl.address),
  );
  const data = Buffer.alloc(162);
  Buffer.from(idl.accounts[0].discriminator).copy(data, 0);
  apartmentId.copy(data, 8);
  data.writeBigUInt64LE(BigInt(90_000_000), 16); // 90 USDC
  new PublicKey("11111111111111111111111111111111").toBuffer().copy(data, 24);
  guest.toBuffer().copy(data, 56);
  data.writeBigUInt64LE(BigInt(ESCROW_CHECK_IN.getTime() / 1000), 88);
  return {
    pubkey: pubkey.toBase58(),
    account: {
      data: [data.toString("base64"), "base64"],
      executable: false,
      lamports: 2_000_000,
      owner: idl.address,
      rentEpoch: 0,
      space: data.length,
    },
  };
};

const RPC_URL = /^https:\/\/api\.devnet\.solana\.com\/?$/;
const WS_URL = /^wss:\/\/api\.devnet\.solana\.com\/?$/;

type RpcCall = { id: number | string; method: string; params?: unknown[] };

const rpcResult = (state: MockState, call: RpcCall): unknown => {
  const context = { slot: 100 };
  switch (call.method) {
    case "getAccountInfo":
      if (
        state.paymentSendAborted &&
        state.paymentSendFails === "checks-fail"
      ) {
        throw new Error("RPC unavailable");
      }
      return {
        context,
        value: (
          state.paymentSendAborted
            ? state.paymentSendFails === "lands-late" && state.settleChecks >= 2
            : state.existingEscrow
        )
          ? {
              data: ["", "base64"],
              executable: false,
              lamports: 1_600_000,
              owner: idl.address,
              rentEpoch: 0,
              space: 98,
            }
          : null,
      };
    case "getLatestBlockhash":
      return {
        context,
        value: {
          blockhash: "11111111111111111111111111111111",
          lastValidBlockHeight: LAST_VALID_BLOCK_HEIGHT,
        },
      };
    case "getBlockHeight":
      if (!state.paymentSendAborted) return 10;
      if (state.paymentSendFails === "checks-fail") {
        throw new Error("RPC unavailable");
      }
      state.settleChecks += 1;
      return state.paymentSendFails === "never-lands" && state.settleChecks >= 2
        ? LAST_VALID_BLOCK_HEIGHT + 100
        : LAST_VALID_BLOCK_HEIGHT - 10;
    case "getProgramAccounts":
      return state.escrowGuest ? [escrowAccount(state.escrowGuest)] : [];
    case "sendTransaction": {
      const signature = firstSignature(String(call.params?.[0] ?? ""));
      state.sent.push(signature);
      return signature;
    }
    case "getSignatureStatuses":
      return {
        context,
        value: ((call.params?.[0] as string[]) ?? []).map(() => ({
          slot: 100,
          confirmations: null,
          err: null,
          confirmationStatus: "finalized",
        })),
      };
    default:
      throw new Error(`Unmocked RPC method ${call.method}`);
  }
};

export const mockSolanaRpc = async (page: Page, state: MockState) => {
  await page.route(RPC_URL, async (route) => {
    const body = route.request().postDataJSON() as RpcCall | RpcCall[];
    const methods = (Array.isArray(body) ? body : [body]).map((c) => c.method);
    if (
      state.paymentSendFails &&
      state.sent.length >= 1 &&
      methods.includes("sendTransaction")
    ) {
      const call = (Array.isArray(body) ? body : [body]).find(
        (c) => c.method === "sendTransaction",
      )!;
      state.sent.push(firstSignature(String(call.params?.[0] ?? "")));
      state.calls.push("rpc:sendTransaction");
      state.paymentSendAborted = true;
      await route.abort("internetdisconnected");
      return;
    }
    const answer = (call: RpcCall) => {
      state.calls.push(`rpc:${call.method}`);
      try {
        return { jsonrpc: "2.0", id: call.id, result: rpcResult(state, call) };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id: call.id,
          error: { code: -32601, message: String(error) },
        };
      }
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        Array.isArray(body) ? body.map(answer) : answer(body),
      ),
    });
  });

  // web3.js confirms through a signature subscription; acknowledge it and
  // report the transaction as processed straight away.
  await page.routeWebSocket(WS_URL, (ws) => {
    let nextId = 1;
    ws.onMessage((raw) => {
      const message = JSON.parse(String(raw)) as RpcCall;
      if (message.method.endsWith("Unsubscribe")) {
        ws.send(
          JSON.stringify({ jsonrpc: "2.0", id: message.id, result: true }),
        );
        return;
      }
      const subscription = nextId++;
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: subscription,
        }),
      );
      if (message.method === "signatureSubscribe") {
        ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            method: "signatureNotification",
            params: {
              subscription,
              result: { context: { slot: 100 }, value: { err: null } },
            },
          }),
        );
      }
    });
  });
};

const json = (status: number, body: unknown) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const record = (state: MockState, request: Request) => {
  const url = new URL(request.url());
  state.calls.push(`${request.method()} ${url.pathname}`);
  state.urls.push(url.href);
  let body: Record<string, unknown> | null = null;
  try {
    body = request.postDataJSON();
  } catch {
    body = null;
  }
  state.requests.push({
    method: request.method(),
    path: url.pathname,
    body,
    authorization: request.headers()["authorization"] ?? null,
  });
};

/** The last mocked request to `method path`. */
export const lastRequest = (state: MockState, method: string, path: string) =>
  state.requests.findLast((r) => r.method === method && r.path === path);

export const mockBookingApi = async (page: Page, state: MockState) => {
  await page.route("**/api/bookings/booked-dates*", (route) => {
    record(state, route.request());
    return route.fulfill(
      state.bookedDatesStatus === 200
        ? json(200, { bookings: state.bookedDates })
        : json(500, { error: "Internal server error" }),
    );
  });
  await page.route("**/api/bookings/availability", (route) => {
    record(state, route.request());
    return route.fulfill(
      json(200, {
        available: state.available,
        conflicts: state.available
          ? []
          : [
              {
                check_in_date: "2026-01-01",
                check_out_date: "2026-01-03",
              },
            ],
      }),
    );
  });
  await page.route("**/api/bookings/session", (route) => {
    record(state, route.request());
    return route.fulfill(
      state.sessionStatus === 201
        ? json(201, {
            token: SESSION_TOKEN,
            expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          })
        : json(401, { error: "The signature does not match this request." }),
    );
  });
  await page.route("**/api/bookings/guest*", (route) => {
    record(state, route.request());
    return route.fulfill(
      route.request().headers()["authorization"] === `Bearer ${SESSION_TOKEN}`
        ? json(200, { bookings: [] })
        : json(401, { error: "Sign in with your wallet to see bookings." }),
    );
  });
  await page.route(/\/api\/bookings(\?.*)?$/, (route) => {
    const request = route.request();
    record(state, request);
    switch (request.method()) {
      case "POST":
        return route.fulfill(
          state.createStatus === 201
            ? json(201, {
                booking: {
                  id: "00000000-0000-4000-8000-000000000001",
                  status: "pending",
                },
              })
            : json(409, {
                error:
                  "Error, double booking attempt, dates no longer available!",
              }),
        );
      case "PATCH":
        return route.fulfill(json(200, { booking: { id: "booking-1" } }));
      case "DELETE":
        return route.fulfill(json(200, { success: true }));
      default:
        return route.fulfill(json(200, { booking: { id: "booking-1" } }));
    }
  });
};
