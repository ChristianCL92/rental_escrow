import { test, expect } from "@playwright/test";

test.describe("Property detail page", () => {
  test.beforeEach(async ({ page }) => {
    // Mock booked-dates API to avoid Supabase dependency
    await page.route("**/api/bookings/booked-dates*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bookings: [] }),
      }),
    );
  });

  test("Room 01 page renders name and price", async ({ page }) => {
    await page.goto("/properties/room-001");

    await expect(
      page.getByRole("heading", { name: "Room 01", level: 1 }),
    ).toBeVisible();
    await expect(
      // The card's own price; the phone booking bar inside it repeats it.
      page.getByTestId("booking-card").getByText("30 USDC / night").first(),
    ).toBeVisible();
  });

  test("Cave apartment renders correct price", async ({ page }) => {
    await page.goto("/properties/apartment-cave");

    await expect(
      page.getByRole("heading", { name: "Cave apartment", level: 1 }),
    ).toBeVisible();
    await expect(
      // The card's own price; the phone booking bar inside it repeats it.
      page.getByTestId("booking-card").getByText("75 USDC / night").first(),
    ).toBeVisible();
  });

  test("the title shows guests, beds and type; the price only in the booking card", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/properties/apartment-cave");

    const facts = page.getByRole("list", { name: "At a glance" });
    await expect(facts.getByRole("listitem")).toHaveText([
      "Up to 4 guests",
      "Double bed + sofa bed",
      "Apartment",
    ]);
    // On a laptop the phone booking bar is hidden, so the nightly price
    // appears exactly once: in the booking card.
    await expect(
      page.getByText("75 USDC / night").filter({ visible: true }),
    ).toHaveCount(1);
    await expect(
      // The card's own price; the phone booking bar inside it repeats it.
      page.getByTestId("booking-card").getByText("75 USDC / night").first(),
    ).toBeVisible();
  });

  test("features are headed Features, also on the apartment", async ({
    page,
  }) => {
    await page.goto("/properties/apartment-cave");

    await expect(
      page.getByRole("heading", { name: "Features", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Room Features")).toHaveCount(0);
    await expect(
      page.getByText(
        "Exclusive underground cave-style apartment, with a private balcony and a view of the nature reserve.",
      ),
    ).toBeVisible();
  });

  test('booking card shows "Book your stay"', async ({ page }) => {
    await page.goto("/properties/room-001");

    await expect(page.locator("text=Book your stay")).toBeVisible();
  });

  test("calendar renders with 2 months from tablet width up", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/properties/room-001");
    await page.waitForSelector("text=Book your stay");

    const monthCaptions = page.locator(".rdp-month_caption");
    await expect(monthCaptions).toHaveCount(2);
  });

  test("calendar renders one month at a time on phones", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/properties/room-001");
    await page.waitForSelector("text=Book your stay");

    const monthCaptions = page.locator(".rdp-month_caption");
    await expect(monthCaptions).toHaveCount(1);
    const first = await monthCaptions.textContent();
    await page.getByRole("button", { name: "Go to the Next Month" }).click();
    await expect(monthCaptions).toHaveCount(1);
    await expect(monthCaptions).not.toHaveText(first!);
  });

  test('book button says "Connect wallet to pay" when disconnected', async ({
    page,
  }) => {
    await page.goto("/properties/room-001");

    await expect(
      page.getByRole("button", { name: "Connect wallet to pay" }),
    ).toBeEnabled();
  });

  test("selecting dates shows price summary", async ({ page }) => {
    await page.goto("/properties/room-001");
    await page.waitForSelector("text=Book your stay");

    await page.locator(".rdp-button_next").click();
    await page.locator(".rdp-button_next").click();

    const dayButtons = page.locator("td:not([data-disabled]) button[data-day]");
    await dayButtons.nth(0).click();
    await dayButtons.nth(2).click();

    await expect(page.getByText("Check-in", { exact: true })).toBeVisible();
    await expect(page.getByText("Check-out", { exact: true })).toBeVisible();
    await expect(page.locator("text=USDC").first()).toBeVisible();
  });

  test("invalid property ID returns not-found", async ({ page }) => {
    const response = await page.goto("/properties/999");

    expect(response?.status()).toBe(404);
  });
});
