import { test, expect, type Page } from "@playwright/test";
import { installFakeWallet, setWalletMode } from "../fixtures/fake-wallet";
import {
  ESCROW_CHECK_IN,
  SESSION_TOKEN,
  createMockState,
  lastRequest,
  mockBookingApi,
  mockSolanaRpc,
  type MockState,
} from "../fixtures/mocks";

const connect = async (page: Page, state: MockState) => {
  await page.goto("/bookings");
  await page
    .locator("main")
    .getByRole("button", { name: "Connect wallet" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Test Wallet/ })
    .click();
  state.escrowGuest = await page.evaluate(() => window.__fakeWallet.address);
};

/**
 * Connects the Test Wallet on /bookings, gives it one upcoming escrow and
 * signs in to My Bookings.
 */
const openMyBookings = async (page: Page, state: MockState) => {
  await connect(page, state);
  await page.getByRole("button", { name: "Sign in with wallet" }).click();
  await expect(page.getByText("Room 01")).toBeVisible();
};

const checkInDay = ESCROW_CHECK_IN.toISOString().slice(0, 10);

test.describe("Signing in to My Bookings", () => {
  let state: MockState;

  test.beforeEach(async ({ page }) => {
    state = createMockState();
    await installFakeWallet(page, "approve");
    await mockSolanaRpc(page, state);
    await mockBookingApi(page, state);
  });

  test("asks for a free signature before showing bookings", async ({
    page,
  }) => {
    await connect(page, state);
    await expect(
      page.getByText(
        "Sign a short message with your wallet to show your bookings. Signing is free and is not a transaction. You stay signed in for 30 minutes.",
      ),
    ).toBeVisible();
    expect(state.calls).not.toContain("GET /api/bookings/guest");
    expect(await page.evaluate(() => window.__fakeWallet.prompts)).toBe(0);

    await page.getByRole("button", { name: "Sign in with wallet" }).click();
    await expect(page.getByText("Room 01")).toBeVisible();
    const [message] = await page.evaluate(() => window.__fakeWallet.messages);
    expect(message).toContain("Action: view");
    expect(lastRequest(state, "GET", "/api/bookings/guest")).toMatchObject({
      authorization: `Bearer ${SESSION_TOKEN}`,
    });
    // The wallet comes from the session, not from the URL.
    const url = state.urls.find((u) => u.includes("/api/bookings/guest"))!;
    expect(new URL(url).search).toBe("");
  });

  test("reuses the session after a reload instead of asking again", async ({
    page,
  }) => {
    await openMyBookings(page, state);
    expect(await page.evaluate(() => window.__fakeWallet.prompts)).toBe(1);

    await page.reload();
    await expect(page.getByText("Room 01")).toBeVisible();
    expect(await page.evaluate(() => window.__fakeWallet.prompts)).toBe(0);
    expect(
      state.calls.filter((c) => c === "POST /api/bookings/session"),
    ).toHaveLength(1);
  });

  test("a refused signature keeps bookings hidden and explains why", async ({
    page,
  }) => {
    await connect(page, state);
    await setWalletMode(page, "reject");
    await page.getByRole("button", { name: "Sign in with wallet" }).click();

    const error = page.getByTestId("booking-error");
    await expect(error).toContainText("You cancelled in your wallet");
    await expect(error).toContainText("Signing is free");
    await expect(page.getByText("Room 01")).toHaveCount(0);
    expect(state.calls).not.toContain("POST /api/bookings/session");

    await setWalletMode(page, "approve");
    await error.getByRole("button", { name: "Dismiss" }).click();
    await page.getByRole("button", { name: "Sign in with wallet" }).click();
    await expect(page.getByText("Room 01")).toBeVisible();
  });
});

test.describe("My Bookings copy", () => {
  test("names the stay and shows amounts the way the rest of the site does", async ({
    page,
  }) => {
    const state = createMockState();
    await installFakeWallet(page, "approve");
    await mockSolanaRpc(page, state);
    await mockBookingApi(page, state);
    await openMyBookings(page, state);

    // The booking's on-chain id 1 is Room 01, by name, not "Apartment #1".
    await expect(page.getByText(/Apartment #/)).toHaveCount(0);
    await expect(page.getByText("Total paid")).toBeVisible();
    await expect(page.getByText("90 USDC", { exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Refetch" })).toHaveCount(0);
  });
});

test.describe("My Bookings with a wallet that cannot sign messages", () => {
  test("says so plainly", async ({ page }) => {
    const state = createMockState();
    await installFakeWallet(page, "approve", { signMessage: false });
    await mockSolanaRpc(page, state);
    await mockBookingApi(page, state);
    await connect(page, state);
    await page.getByRole("button", { name: "Sign in with wallet" }).click();

    const error = page.getByTestId("booking-error");
    await expect(error).toContainText("This wallet can't sign the request");
    await expect(error).toContainText("Phantom or Solflare");
    expect(state.calls).not.toContain("POST /api/bookings/session");
  });
});

test.describe("Cancelling on My Bookings", () => {
  let state: MockState;

  test.beforeEach(async ({ page }) => {
    state = createMockState();
    await installFakeWallet(page, "approve");
    await mockSolanaRpc(page, state);
    await mockBookingApi(page, state);
  });

  test.describe("west of UTC", () => {
    test.use({ timezoneId: "America/Bogota" });

    test("shows and cancels the booked check-in day, not the day before", async ({
      page,
    }) => {
      await openMyBookings(page, state);

      const day = ESCROW_CHECK_IN.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
      await expect(page.getByText(`Check-in: ${day}`)).toBeVisible();

      await page.getByRole("button", { name: "Cancel Booking" }).click();
      await expect.poll(() => state.calls).toContain("PATCH /api/bookings");
      expect(lastRequest(state, "PATCH", "/api/bookings")!.body).toMatchObject({
        checkInDate: checkInDay,
      });
      const messages = await page.evaluate(() => window.__fakeWallet.messages);
      expect(messages.at(-1)).toContain(`Check-in: ${checkInDay}`);
    });
  });

  test("a cancel refused in the wallet keeps the booking and its dates", async ({
    page,
  }) => {
    await openMyBookings(page, state);
    await setWalletMode(page, "reject");
    await page.getByRole("button", { name: "Cancel Booking" }).click();

    const error = page.getByTestId("booking-error");
    await expect(error).toContainText(
      "You cancelled in your wallet - nothing changed",
    );
    await expect(error).toContainText("your USDC is still in escrow");
    // The dates must stay blocked: no refund, no booking record touched.
    expect(state.sent).toHaveLength(0);
    expect(state.calls).not.toContain("PATCH /api/bookings");

    await error.getByRole("button", { name: "Dismiss" }).click();
    await expect(error).toBeHidden();
  });

  test("signs the cancel, refunds on chain, then records it", async ({
    page,
  }) => {
    await openMyBookings(page, state);
    await page.getByRole("button", { name: "Cancel Booking" }).click();

    await expect.poll(() => state.calls).toContain("PATCH /api/bookings");
    const address = await page.evaluate(() => window.__fakeWallet.address!);
    const messages = await page.evaluate(() => window.__fakeWallet.messages);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toContain("Action: cancel");
    expect(messages[1]).toContain("Apartment: 1");
    expect(lastRequest(state, "PATCH", "/api/bookings")!.body).toMatchObject({
      status: "cancelled",
      apartmentId: 1,
      checkInDate: checkInDay,
      auth: { wallet: address },
    });
    // Two prompts for the cancel: the signature, then the refund.
    expect(await page.evaluate(() => window.__fakeWallet.prompts)).toBe(3);
    expect(state.sent).toHaveLength(1);
    expect(state.calls.indexOf("rpc:sendTransaction")).toBeLessThan(
      state.calls.indexOf("PATCH /api/bookings"),
    );
    await expect(page.getByTestId("booking-error")).toHaveCount(0);
  });
});
