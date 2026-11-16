import { test, expect, type Page } from "@playwright/test";
import { installFakeWallet, setWalletMode } from "../fixtures/fake-wallet";
import {
  ESCROW_CHECK_IN,
  createMockState,
  mockBookingApi,
  mockSolanaRpc,
  type MockState,
} from "../fixtures/mocks";

/** Connects the Test Wallet on /bookings and gives it one upcoming escrow. */
const openMyBookings = async (page: Page, state: MockState) => {
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
  await page.getByRole("button", { name: "Refetch" }).click();
  await expect(page.getByText("Apartment #1")).toBeVisible();
};

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
      const lookup = state.urls.find((u) => u.includes("checkInDate="));
      expect(new URL(lookup!).searchParams.get("checkInDate")).toBe(
        ESCROW_CHECK_IN.toISOString().slice(0, 10),
      );
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
    // The dates must stay blocked: no booking record is touched.
    expect(state.calls).not.toContain("PATCH /api/bookings");
    expect(state.calls).not.toContain("GET /api/bookings");

    await error.getByRole("button", { name: "Dismiss" }).click();
    await expect(error).toBeHidden();
  });

  test("the booking record is cancelled only after the refund confirms", async ({
    page,
  }) => {
    await openMyBookings(page, state);
    await page.getByRole("button", { name: "Cancel Booking" }).click();

    await expect.poll(() => state.calls).toContain("PATCH /api/bookings");
    // The booking record is looked up by the guest's check-in day.
    const lookup = state.urls.find((u) => u.includes("checkInDate="));
    expect(new URL(lookup!).searchParams.get("checkInDate")).toBe(
      ESCROW_CHECK_IN.toISOString().slice(0, 10),
    );
    expect(state.sent).toHaveLength(1);
    expect(state.calls.indexOf("rpc:sendTransaction")).toBeLessThan(
      state.calls.indexOf("PATCH /api/bookings"),
    );
    await expect(page.getByTestId("booking-error")).toHaveCount(0);
  });
});
