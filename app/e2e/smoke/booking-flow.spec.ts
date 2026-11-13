import { test, expect, type Page } from "@playwright/test";
import {
  answerWalletPrompt,
  installFakeWallet,
  setWalletMode,
} from "../fixtures/fake-wallet";
import {
  createMockState,
  mockBookingApi,
  mockSolanaRpc,
  type MockState,
} from "../fixtures/mocks";

const bookingCard = (page: Page) => page.getByTestId("booking-card");

/** Picks two nights, two months ahead so every day is selectable. */
const selectTwoNights = async (page: Page) => {
  await page.locator(".rdp-button_next").click();
  await page.locator(".rdp-button_next").click();
  const days = page.locator("td:not([data-disabled]) button[data-day]");
  await days.nth(0).click();
  await days.nth(2).click();
  await expect(page.getByText("30 USDC × 2 nights")).toBeVisible();
};

const connectTestWallet = async (page: Page) => {
  await page.getByRole("button", { name: "Connect wallet to pay" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Test Wallet/ })
    .click();
  await expect(page.getByTestId("wallet-menu-trigger")).toBeVisible();
};

test.describe("Booking card without a wallet", () => {
  let state: MockState;

  test.beforeEach(async ({ page }) => {
    state = createMockState();
    await mockBookingApi(page, state);
  });

  test("explains payment, fees and the test network before booking", async ({
    page,
  }) => {
    await page.goto("/properties/room-001");

    const card = bookingCard(page);
    await expect(card.getByText("Test network - no real money")).toBeVisible();
    const explainer = card.getByRole("region", { name: "How payment works" });
    await expect(explainer.getByRole("listitem")).toHaveText([
      "1Your USDC goes into an escrow account (opens in a new tab), not to the host.",
      "2Cancel before check-in for a full refund.",
      "3The host can collect the payment only from check-in.",
    ]);
    await expect(
      explainer.getByRole("link", { name: /escrow account/ }),
    ).toHaveAttribute(
      "href",
      /^https:\/\/explorer\.solana\.com\/address\/\w+\?cluster=devnet$/,
    );
    await expect(card.getByTestId("fee-note")).toHaveText(
      "Plus a small network fee, paid in SOL.1 USDC ≈ 1 US dollar.",
    );
  });

  test("shows the exact refund deadline once dates are picked", async ({
    page,
  }) => {
    await page.goto("/properties/room-001");
    await selectTwoNights(page);

    await expect(
      bookingCard(page).getByText(
        /Cancel before check-in \(.+\d:\d\d.+\) for a full refund\./,
      ),
    ).toBeVisible();
  });

  test("the pay button opens the wallet picker, with help for new users", async ({
    page,
  }) => {
    await page.goto("/properties/room-001");

    const help = page.getByTestId("wallet-help");
    await expect(help).toHaveText(
      "New to crypto wallets? Phantom (opens in a new tab) or Solflare (opens in a new tab) take two minutes to set up.",
    );
    await expect(help.getByRole("link", { name: /Phantom/ })).toHaveAttribute(
      "href",
      "https://phantom.com/download",
    );

    const pay = page.getByRole("button", { name: "Connect wallet to pay" });
    await expect(pay).toBeEnabled();
    await pay.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("says plainly when booked dates cannot be loaded", async ({ page }) => {
    state.bookedDatesStatus = 500;
    await page.goto("/properties/room-001");

    const warning = page.getByTestId("booked-dates-warning");
    await expect(warning).toContainText("Some taken nights may not be shown");
    await expect(warning).toHaveAttribute("role", "status");
    const raw = warning.getByText("Internal server error");
    await expect(raw).toBeHidden();
    await warning.getByText("Details").click();
    await expect(raw).toBeVisible();

    state.bookedDatesStatus = 200;
    await warning.getByRole("button", { name: "Try again" }).click();
    await expect(warning).toBeHidden();
  });
});

test.describe("Booking with a wallet", () => {
  let state: MockState;

  test.beforeEach(async ({ page }) => {
    state = createMockState();
    await installFakeWallet(page, "approve");
    await mockSolanaRpc(page, state);
    await mockBookingApi(page, state);
    await page.goto("/properties/room-001");
  });

  test("hides wallet help when a wallet is installed", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Connect wallet to pay" }),
    ).toBeVisible();
    await expect(page.getByTestId("wallet-help")).toHaveCount(0);
  });

  test("nav shows the short address and My Bookings in the wallet menu", async ({
    page,
  }) => {
    await connectTestWallet(page);
    const address = await page.evaluate(() => window.__fakeWallet.address!);
    const trigger = page.getByTestId("wallet-menu-trigger");
    await expect(trigger).toHaveText(
      `Wallet ${address.slice(0, 4)}…${address.slice(-4)}`,
    );

    await trigger.click();
    await expect(page.getByRole("menu")).toContainText(
      "Connected with Test Wallet",
    );
    await page.getByRole("menuitem", { name: "My Bookings" }).click();
    await expect(page).toHaveURL("/bookings");
  });

  test("walks through both wallet approvals to a confirmation", async ({
    page,
  }) => {
    await connectTestWallet(page);
    await setWalletMode(page, "hold");
    await selectTwoNights(page);
    await page.getByRole("button", { name: "Book for 60 USDC" }).click();

    const progress = page.getByTestId("booking-progress");
    const current = progress.locator('[aria-current="step"]');
    const status = page
      .getByRole("status")
      .filter({ hasText: /step|confirmed/i });

    await expect(current).toContainText("Approve in wallet (1 of 2)");
    await expect(status).toHaveText("Approve in your wallet, step 1 of 2.");
    await expect(progress).toContainText("no USDC moves yet");
    await answerWalletPrompt(page, true);

    await expect(current).toContainText("Approve payment (2 of 2)");
    await expect(progress).toContainText("not a double charge");
    await expect(status).toHaveText(
      "Approve the payment in your wallet, step 2 of 2.",
    );
    await answerWalletPrompt(page, true);

    const confirmation = page.getByTestId("booking-confirmation");
    await expect(confirmation).toContainText("Booking confirmed");
    await expect(confirmation).toContainText("Nights2");
    await expect(confirmation).toContainText(
      "Held in escrow60 USDC, until check-in",
    );
    await expect(confirmation).toContainText(
      /Free cancellationUntil .+\d:\d\d/,
    );
    await expect(status).toHaveText(
      "Booking confirmed. 60 USDC is held in escrow until check-in.",
    );
    await expect(
      confirmation.getByRole("link", { name: "View my booking" }),
    ).toHaveAttribute("href", "/bookings");
    await expect(
      confirmation.getByRole("link", { name: /View transaction/ }),
    ).toHaveAttribute(
      "href",
      `https://explorer.solana.com/tx/${state.sent[1]}?cluster=devnet`,
    );
    expect(state.sent).toHaveLength(2);
    expect(state.calls).toContain("PATCH /api/bookings");
    expect(state.calls).not.toContain("DELETE /api/bookings");

    await confirmation.getByRole("button", { name: "Dismiss" }).click();
    await expect(confirmation).toBeHidden();
  });

  test("cancelling in the wallet says nothing was charged", async ({
    page,
  }) => {
    await connectTestWallet(page);
    await setWalletMode(page, "reject");
    await selectTwoNights(page);
    await page.getByRole("button", { name: "Book for 60 USDC" }).click();

    const error = page.getByRole("alert").filter({ hasText: "You cancelled" });
    await expect(error).toContainText(
      "You cancelled in your wallet - nothing was charged",
    );
    await expect(error.getByText("User rejected the request.")).toBeHidden();
    await error.getByText("Details").click();
    await expect(error.getByText(/User rejected the request\./)).toBeVisible();
    expect(state.calls).toContain("DELETE /api/bookings");
    expect(state.sent).toHaveLength(0);

    await error.getByRole("button", { name: "Dismiss" }).click();
    await expect(error).toBeHidden();
  });

  test("taken dates are explained in plain words", async ({ page }) => {
    state.available = false;
    await connectTestWallet(page);
    await selectTwoNights(page);
    await page.getByRole("button", { name: "Book for 60 USDC" }).click();

    await expect(page.getByTestId("booking-error")).toContainText(
      "Those dates were just taken",
    );
    expect(state.calls).not.toContain("POST /api/bookings");
  });

  test("an existing booking for the room is caught before paying", async ({
    page,
  }) => {
    state.existingEscrow = true;
    await connectTestWallet(page);
    await selectTwoNights(page);
    await page.getByRole("button", { name: "Book for 60 USDC" }).click();

    const error = page.getByTestId("booking-error");
    await expect(error).toHaveAttribute("role", "alert");
    await expect(error).toContainText(
      "You already have an active booking for this room",
    );
    await expect(
      error.getByRole("link", { name: "Go to My Bookings" }),
    ).toHaveAttribute("href", "/bookings");
    expect(state.calls).not.toContain("POST /api/bookings");
    expect(await page.evaluate(() => window.__fakeWallet.prompts)).toBe(0);
  });
});
