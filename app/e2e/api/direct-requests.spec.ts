import { test as base, expect } from "@playwright/test";
import { ed25519 } from "@noble/curves/ed25519";
import { Keypair } from "@solana/web3.js";
import { buildAuthMessage } from "../../lib/booking/auth-message";

/**
 * Direct requests to the real booking routes, as from Postman: no browser,
 * no wallet. Each is refused before the route reads or writes the database,
 * so these run without Supabase or Upstash credentials. The full flows
 * (with a database, the chain and replay protection) are covered by the
 * unit tests in lib/server.
 */

const day = (offsetDays: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
};

const guest = Keypair.generate();
const victim = Keypair.generate();
const STAY = { apartmentId: 1, checkInDate: day(7), checkOutDate: day(9) };

/** A reserve signature by `signer`, claiming to be `wallet`. */
const reserveAuth = (
  signer: Keypair,
  wallet = signer.publicKey.toBase58(),
  issuedAt = new Date().toISOString(),
) => {
  const nonce = "0123456789abcdef0123456789abcdef";
  const message = buildAuthMessage({
    action: "reserve",
    ...STAY,
    wallet,
    issuedAt,
    nonce,
  });
  const signature = ed25519.sign(
    new TextEncoder().encode(message),
    signer.secretKey.slice(0, 32),
  );
  return {
    wallet,
    issuedAt,
    nonce,
    signature: Buffer.from(signature).toString("base64"),
  };
};

const octet = () => Math.floor(Math.random() * 256);

// Each test is its own caller (its own x-forwarded-for), so the per-IP rate
// limiter in proxy.ts does not turn these refusals into 429s.
const test = base.extend({
  request: async ({ playwright, baseURL }, provide) => {
    const context = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: {
        "x-forwarded-for": `198.18.${octet()}.${octet()}`,
      },
    });
    await provide(context);
    await context.dispose();
  },
});

test.describe("Direct requests to the booking API are refused", () => {
  test("an unsigned hold (the reported Postman request)", async ({
    request,
  }) => {
    const res = await request.post("/api/bookings", {
      data: { ...STAY, guestWallet: victim.publicKey.toBase58() },
    });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({
      error: "This request must be signed with your wallet.",
    });
  });

  test("a year-long hold", async ({ request }) => {
    const res = await request.post("/api/bookings", {
      data: { ...STAY, checkOutDate: day(365) },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe("A stay can be at most 30 nights.");
  });

  test("a hold signed by another wallet than the one it names", async ({
    request,
  }) => {
    const res = await request.post("/api/bookings", {
      data: {
        ...STAY,
        auth: reserveAuth(guest, victim.publicKey.toBase58()),
      },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe(
      "The signature does not match this request.",
    );
  });

  test("a hold with an expired signature", async ({ request }) => {
    const res = await request.post("/api/bookings", {
      data: {
        ...STAY,
        auth: reserveAuth(
          guest,
          undefined,
          new Date(Date.now() - 6 * 60_000).toISOString(),
        ),
      },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe(
      "Your signature expired. Please sign again.",
    );
  });

  test("a hold for dates signed differently", async ({ request }) => {
    const res = await request.post("/api/bookings", {
      data: { ...STAY, checkOutDate: day(20), auth: reserveAuth(guest) },
    });
    expect(res.status()).toBe(401);
  });

  test("fake-confirming a booking", async ({ request }) => {
    const res = await request.patch("/api/bookings", {
      data: {
        bookingId: "00000000-0000-4000-8000-000000000001",
        status: "confirmed",
        txSignature: "5".repeat(87),
        ...STAY,
      },
    });
    expect(res.status()).toBe(401);
  });

  test("cancelling someone else's booking", async ({ request }) => {
    const res = await request.patch("/api/bookings", {
      data: {
        status: "cancelled",
        apartmentId: 1,
        checkInDate: STAY.checkInDate,
      },
    });
    expect(res.status()).toBe(401);
  });

  test("deleting someone else's booking", async ({ request }) => {
    const reportShaped = await request.delete("/api/bookings", {
      data: {
        bookingId: "00000000-0000-4000-8000-000000000001",
        guestWallet: victim.publicKey.toBase58(),
      },
    });
    expect(reportShaped.status()).toBe(400);
    const unsigned = await request.delete("/api/bookings", {
      data: { bookingId: "00000000-0000-4000-8000-000000000001", ...STAY },
    });
    expect(unsigned.status()).toBe(401);
  });

  test("listing a wallet's bookings and ids", async ({ request }) => {
    const res = await request.get(
      `/api/bookings/guest?wallet=${victim.publicKey.toBase58()}`,
    );
    expect(res.status()).toBe(401);
    const forged = await request.get("/api/bookings/guest", {
      headers: { Authorization: "Bearer not-a-real-session" },
    });
    expect(forged.status()).toBe(401);
  });

  test("looking up a booking id by wallet and dates", async ({ request }) => {
    const res = await request.get(
      `/api/bookings?apartmentId=1&checkInDate=${STAY.checkInDate}&guestWallet=${victim.publicKey.toBase58()}`,
    );
    expect(res.status()).toBe(405);
  });

  test("a session without a signature", async ({ request }) => {
    const res = await request.post("/api/bookings/session", { data: {} });
    expect(res.status()).toBe(401);
  });

  test("public routes refuse rooms and dates that do not exist", async ({
    request,
  }) => {
    expect(
      (await request.get("/api/bookings/booked-dates?apartmentId=99")).status(),
    ).toBe(400);
    const reversed = await request.post("/api/bookings/availability", {
      data: {
        ...STAY,
        checkInDate: STAY.checkOutDate,
        checkOutDate: STAY.checkInDate,
      },
    });
    expect(reversed.status()).toBe(400);
  });
});
