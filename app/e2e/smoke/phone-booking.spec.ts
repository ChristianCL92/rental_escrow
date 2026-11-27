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

const bar = (page: Page) => page.getByTestId("phone-booking-bar");
const calendar = (page: Page) =>
  page.getByRole("group", { name: "Choose your dates" });

/** Picks two nights two months ahead, where every day is selectable. */
const selectTwoNights = async (page: Page) => {
  const next = page.getByRole("button", { name: "Go to the Next Month" });
  await next.click();
  await next.click();
  const days = page.locator(
    "td:not([data-outside]):not([data-disabled]) button[data-day]",
  );
  await days.nth(0).click();
  await days.nth(2).click();
  await expect(page.getByText("30 USDC × 2 nights")).toBeVisible();
};

const expectBelowNav = async (page: Page) => {
  const nav = await page.locator("body > nav").boundingBox();
  const box = await calendar(page).boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(nav!.y + nav!.height);
};

test.describe("Phone booking bar", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  let state: MockState;

  test.beforeEach(async ({ page }) => {
    state = createMockState();
    await mockBookingApi(page, state);
  });

  test("shows the nightly price and leads to the calendar", async ({
    page,
  }) => {
    await page.goto("/properties/room-001");

    await expect(bar(page)).toBeInViewport();
    await expect(bar(page)).toContainText("30 USDC / night");
    await expect(calendar(page)).not.toBeInViewport();

    const checkDates = bar(page).getByRole("button", { name: "Check dates" });
    expect((await checkDates.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await checkDates.tap();

    await expect(calendar(page)).toBeFocused();
    await expect(calendar(page)).toBeInViewport();
    await expectBelowNav(page);
    await expect(page.locator(".rdp-month_caption")).toHaveCount(1);
  });

  test("shows the picked stay and its total next to the Book button", async ({
    page,
  }) => {
    await page.goto("/properties/room-001");
    const announcer = bar(page).locator('[aria-live="polite"]');
    await expect(announcer).toHaveText("");

    await selectTwoNights(page);

    await expect(bar(page)).toContainText("60 USDC");
    await expect(bar(page)).toContainText(
      /[A-Z][a-z]{2} \d{1,2}(-\d{1,2}| - [A-Z][a-z]{2} \d{1,2}) · 2 nights/,
    );
    await expect(announcer).toHaveText(
      /^[A-Z][a-z]+ \d{1,2} to [A-Z][a-z]+ \d{1,2}, 2 nights, 60 USDC total$/,
    );

    // Without a wallet, the bar's button connects one, like the card's.
    const connect = bar(page).getByRole("button", { name: "Connect wallet" });
    expect((await connect.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await connect.tap();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    // The summary leads back to the calendar to change the dates.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(calendar(page)).not.toBeInViewport();
    await bar(page)
      .getByRole("button", { name: /change dates/ })
      .tap();
    await expect(calendar(page)).toBeInViewport();
    await expectBelowNav(page);
  });

  test("the end of the page and the footer stay clear of the bar", async ({
    page,
  }) => {
    await page.goto("/properties/room-001");
    // The page scrolls smoothly (globals.css); jump so the measure is final.
    await page.evaluate(() =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      }),
    );

    const footer = (await page.locator("footer").boundingBox())!;
    const barBox = (await bar(page).boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(barBox.y + 0.5);
    await expect(
      page.getByRole("link", { name: "Contact us on WhatsApp" }),
    ).toBeInViewport();
  });

  test("books through the booking card and shows its progress", async ({
    page,
  }) => {
    await installFakeWallet(page, "approve");
    await mockSolanaRpc(page, state);
    await page.goto("/properties/room-001");
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .tap();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Test Wallet/ })
      .click();
    await expect(page.getByTestId("wallet-menu-trigger")).toBeVisible();

    await selectTwoNights(page);
    await setWalletMode(page, "hold");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await bar(page).getByRole("button", { name: "Book", exact: true }).tap();

    // The card's own progress comes into view; the bar waits with it.
    const progress = page.getByTestId("booking-progress");
    await expect(progress).toBeInViewport();
    const busy = bar(page).getByRole("button", { name: "Booking..." });
    await expect(busy).toBeDisabled();
    for (let prompt = 0; prompt < 3; prompt++) {
      await answerWalletPrompt(page, true);
    }

    const confirmation = page.getByTestId("booking-confirmation");
    await expect(confirmation).toContainText("Booking confirmed");
    await expect(confirmation).toBeInViewport();
    expect(state.sent).toHaveLength(2);
    // The card clears the dates once booked, and the bar follows.
    await expect(
      bar(page).getByRole("button", { name: "Check dates" }),
    ).toBeVisible();
  });
});

test.describe("Larger screens", () => {
  test.beforeEach(async ({ page }) => {
    await mockBookingApi(page, createMockState());
  });

  for (const width of [768, 1440]) {
    test(`keep the booking card as it is, with no bar, at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/properties/room-001");

      await expect(page.getByText("Book your stay")).toBeVisible();
      await expect(bar(page)).toBeHidden();
      await expect(page.locator(".rdp-month_caption")).toHaveCount(2);
      const padding = await page.evaluate(
        () => getComputedStyle(document.body).paddingBottom,
      );
      expect(padding).toBe("0px");
    });
  }
});
