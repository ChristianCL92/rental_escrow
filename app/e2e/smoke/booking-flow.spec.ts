import { test, expect, type Page } from "@playwright/test";
import {
  answerWalletPrompt,
  installFakeWallet,
  setWalletMode,
} from "../fixtures/fake-wallet";
import {
  createMockState,
  lastRequest,
  mockBookingApi,
  mockSolanaRpc,
  type MockState,
} from "../fixtures/mocks";

const bookingCard = (page: Page) => page.getByTestId("booking-card");

/** react-day-picker's data-day ("12/27/2026") as the API sends it. */
const apiDay = (dataDay: string) => {
  const [month, day, year] = dataDay.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

/** The data-day react-day-picker gives a UTC calendar day. */
const dataDay = (date: Date) =>
  date.toLocaleDateString("en-US", { timeZone: "UTC" });

/**
 * Picks two nights, two months ahead so every day is selectable. Returns
 * the check-in and check-out days as the API sends them (yyyy-MM-dd).
 */
const selectTwoNights = async (page: Page) => {
  await page.locator(".rdp-button_next").click();
  await page.locator(".rdp-button_next").click();
  const days = page.locator("td:not([data-disabled]) button[data-day]");
  const checkIn = await days.nth(0).getAttribute("data-day");
  const checkOut = await days.nth(2).getAttribute("data-day");
  await days.nth(0).click();
  await days.nth(2).click();
  await expect(page.getByText("30 USDC × 2 nights")).toBeVisible();
  return { checkIn: apiDay(checkIn!), checkOut: apiDay(checkOut!) };
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
    await expect(page).toHaveURL("/bookings", { timeout: 15_000 });
  });

  test("walks through the signature and both wallet approvals to a confirmation", async ({
    page,
  }) => {
    await connectTestWallet(page);
    await setWalletMode(page, "hold");
    const { checkIn, checkOut } = await selectTwoNights(page);
    await page.getByRole("button", { name: "Book for 60 USDC" }).click();

    const progress = page.getByTestId("booking-progress");
    const current = progress.locator('[aria-current="step"]');
    const status = page
      .getByRole("status")
      .filter({ hasText: /step|confirmed|sign/i });

    await expect(current).toContainText("Sign to reserve");
    await expect(status).toHaveText(
      "Sign the free message in your wallet to reserve your dates.",
    );
    await expect(progress).toContainText(
      "Signing is free, is not a transaction and moves no money.",
    );
    await expect(progress).toContainText("holds the nights for 10 minutes");
    // Nothing is held until the guest signs.
    expect(state.calls).not.toContain("POST /api/bookings");
    await answerWalletPrompt(page, true);

    // The signed message names the action, the stay and the wallet.
    const address = await page.evaluate(() => window.__fakeWallet.address!);
    const [message] = await page.evaluate(() => window.__fakeWallet.messages);
    expect(message).toContain("Action: reserve");
    expect(message).toContain(`Wallet: ${address}`);
    expect(message).toContain("Apartment: 1");
    expect(message).toContain(`Check-in: ${checkIn}`);
    expect(message).toContain(`Check-out: ${checkOut}`);
    expect(message).toMatch(/Issued at: \S+Z\nNonce: [0-9a-f]{32}$/);

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
    expect(state.calls).not.toContain("DELETE /api/bookings");

    // The hold is created with the signature, for the signing wallet; the
    // confirmation carries the same signature and the payment.
    const created = lastRequest(state, "POST", "/api/bookings")!.body!;
    expect(created).toMatchObject({
      apartmentId: 1,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      auth: { wallet: address },
    });
    expect(created).not.toHaveProperty("guestWallet");
    expect(lastRequest(state, "PATCH", "/api/bookings")!.body).toMatchObject({
      bookingId: "00000000-0000-4000-8000-000000000001",
      status: "confirmed",
      txSignature: state.sent[1],
      checkInDate: checkIn,
      checkOutDate: checkOut,
      auth: created.auth as object,
    });

    await confirmation.getByRole("button", { name: "Dismiss" }).click();
    await expect(confirmation).toBeHidden();
  });

  test("refusing the signature holds nothing and charges nothing", async ({
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
    await expect(error).toContainText("No nights were held.");
    await expect(error.getByText("User rejected the request.")).toBeHidden();
    await error.getByText("Details").click();
    await expect(error.getByText(/User rejected the request\./)).toBeVisible();
    expect(state.calls).not.toContain("POST /api/bookings");
    expect(state.calls).not.toContain("DELETE /api/bookings");
    expect(state.sent).toHaveLength(0);

    await error.getByRole("button", { name: "Dismiss" }).click();
    await expect(error).toBeHidden();
  });

  test("refusing the payment releases the hold with the same signature", async ({
    page,
  }) => {
    await connectTestWallet(page);
    await setWalletMode(page, "hold");
    await selectTwoNights(page);
    await page.getByRole("button", { name: "Book for 60 USDC" }).click();

    await answerWalletPrompt(page, true); // sign to reserve
    await answerWalletPrompt(page, true); // account setup
    await answerWalletPrompt(page, false); // payment

    const error = page.getByRole("alert").filter({ hasText: "You cancelled" });
    await expect(error).toContainText(
      "You cancelled in your wallet - no USDC was charged",
    );
    await expect.poll(() => state.calls).toContain("DELETE /api/bookings");
    const created = lastRequest(state, "POST", "/api/bookings")!.body!;
    expect(lastRequest(state, "DELETE", "/api/bookings")!.body).toMatchObject({
      bookingId: "00000000-0000-4000-8000-000000000001",
      checkInDate: created.checkInDate as string,
      auth: created.auth as object,
    });
    expect(state.calls).not.toContain("PATCH /api/bookings");
  });

  const payWhileTheNetworkDrops = async (page: Page) => {
    await connectTestWallet(page);
    await selectTwoNights(page);
    await page.getByRole("button", { name: "Book for 60 USDC" }).click();
  };

  test("a payment that lands late ends in a confirmation", async ({ page }) => {
    state.paymentSendFails = "lands-late";
    await payWhileTheNetworkDrops(page);

    await expect(page.getByTestId("booking-progress")).toContainText(
      "Confirming your payment...",
    );
    const confirmation = page.getByTestId("booking-confirmation");
    await expect(confirmation).toContainText("Booking confirmed", {
      timeout: 15_000,
    });
    await expect(
      confirmation.getByRole("link", { name: /View transaction/ }),
    ).toHaveAttribute(
      "href",
      `https://explorer.solana.com/tx/${state.sent[1]}?cluster=devnet`,
    );
    await expect(page.getByTestId("booking-error")).toHaveCount(0);
    expect(state.settleChecks).toBeGreaterThanOrEqual(2);
    expect(state.calls).toContain("PATCH /api/bookings");
    expect(state.calls).not.toContain("DELETE /api/bookings");
  });

  test("a payment that expires without landing releases the dates", async ({
    page,
  }) => {
    state.paymentSendFails = "never-lands";
    await payWhileTheNetworkDrops(page);

    await expect(page.getByTestId("booking-progress")).toContainText(
      "Confirming your payment...",
    );
    const error = page.getByTestId("booking-error");
    await expect(error).toContainText("Your payment didn't go through", {
      timeout: 15_000,
    });
    await expect(error).toContainText("No USDC was charged");
    expect(state.settleChecks).toBeGreaterThanOrEqual(2);
    await expect.poll(() => state.calls).toContain("DELETE /api/bookings");
    expect(state.calls).not.toContain("PATCH /api/bookings");
  });

  test("a payment that cannot be checked keeps the dates held", async ({
    page,
  }) => {
    state.paymentSendFails = "checks-fail";
    await payWhileTheNetworkDrops(page);

    const error = page.getByTestId("booking-error");
    await expect(error).toContainText("We couldn't confirm your payment", {
      timeout: 20_000,
    });
    await expect(error).toContainText("Check My Bookings before trying again");
    expect(state.calls).not.toContain("DELETE /api/bookings");
    expect(state.calls).not.toContain("PATCH /api/bookings");
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
    // Checked before asking for the signature.
    expect(await page.evaluate(() => window.__fakeWallet.prompts)).toBe(0);
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

test.describe("Booking with a wallet that cannot sign messages", () => {
  let state: MockState;

  test.beforeEach(async ({ page }) => {
    state = createMockState();
    await installFakeWallet(page, "approve", { signMessage: false });
    await mockSolanaRpc(page, state);
    await mockBookingApi(page, state);
    await page.goto("/properties/room-001");
  });

  test("says so plainly instead of starting a booking", async ({ page }) => {
    await connectTestWallet(page);
    await selectTwoNights(page);
    await page.getByRole("button", { name: "Book for 60 USDC" }).click();

    const error = page.getByTestId("booking-error");
    await expect(error).toContainText("This wallet can't sign the request");
    await expect(error).toContainText("Phantom or Solflare");
    await expect(error).toContainText("Nothing was charged.");
    await expect(
      error.getByRole("button", { name: "Connect wallet" }),
    ).toBeVisible();
    expect(state.calls).not.toContain("POST /api/bookings");
    expect(await page.evaluate(() => window.__fakeWallet.prompts)).toBe(0);
    await expect(
      page.getByRole("button", { name: "Book for 60 USDC" }),
    ).toBeEnabled();
  });
});

test.describe("Booking limits in the calendar", () => {
  test.beforeEach(async ({ page }) => {
    await mockBookingApi(page, createMockState());
    await page.goto("/properties/room-001");
  });

  test("stays longer than 30 nights cannot be picked", async ({ page }) => {
    await page.locator(".rdp-button_next").click();
    const days = page.locator("td:not([data-disabled]) button[data-day]");
    await days.nth(0).click();
    // 31 nights later: the picker starts a new range instead.
    const start = await days.nth(0).getAttribute("data-day");
    const end = new Date(`${apiDay(start!)}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 31);
    await page.locator(".rdp-button_next").click();
    await page.locator(`button[data-day="${dataDay(end)}"]`).click();
    await expect(page.getByText(/× 31 nights/)).toHaveCount(0);
  });

  test("the calendar ends 12 months ahead", async ({ page }) => {
    const next = page.locator(".rdp-button_next");
    for (let i = 0; i < 14 && (await next.isEnabled()); i++) {
      await next.click();
    }
    await expect(next).toBeDisabled();
    const now = new Date();
    const last = new Date(
      Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()),
    );
    const month = last.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    await expect(page.getByText(month)).toBeVisible();
    // Days after the limit are disabled.
    const after = new Date(last);
    after.setUTCDate(after.getUTCDate() + 1);
    if (after.getUTCMonth() === last.getUTCMonth()) {
      await expect(
        page.locator(
          `td[data-disabled="true"] button[data-day="${dataDay(after)}"]`,
        ),
      ).toHaveCount(1);
    }
  });
});
