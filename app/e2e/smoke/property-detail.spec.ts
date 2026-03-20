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

  test("Room 001 page renders name and price", async ({ page }) => {
    await page.goto("/properties/room-001");

    await expect(page.getByRole("heading", { name: "Room 001" })).toBeVisible();
    await expect(page.locator("text=30 USDC").first()).toBeVisible();
  });

  test("Apartment Cave renders correct price", async ({ page }) => {
    await page.goto("/properties/apartment-cave");

    await expect(
      page.getByRole("heading", { name: "Apartment Cave" }),
    ).toBeVisible();
    await expect(page.locator("text=75 USDC").first()).toBeVisible();
  });

  test('booking card shows "Book your stay"', async ({ page }) => {
    await page.goto("/properties/room-001");

    await expect(page.locator("text=Book your stay")).toBeVisible();
  });

  test("calendar renders with 2 months", async ({ page }) => {
    await page.goto("/properties/room-001");
    await page.waitForSelector("text=Book your stay");

    const monthCaptions = page.locator(".rdp-month_caption");
    await expect(monthCaptions).toHaveCount(2);
  });

  test('book button says "Connect Wallet to Book" when disconnected', async ({
    page,
  }) => {
    await page.goto("/properties/room-001");

    await expect(
      page.locator("button", { hasText: "Connect Wallet to Book" }),
    ).toBeVisible();
  });

  test("selecting dates shows price summary", async ({ page }) => {
    await page.goto("/properties/room-001");
    await page.waitForSelector("text=Book your stay");

    await page.locator(".rdp-button_next").click();
    await page.locator(".rdp-button_next").click();

    const dayButtons = page.locator("td:not([data-disabled]) button[data-day]");
    await dayButtons.nth(0).click();
    await dayButtons.nth(2).click();

    await expect(page.locator("text=Check-in")).toBeVisible();
    await expect(page.locator("text=Check-out")).toBeVisible();
    await expect(page.locator("text=USDC").first()).toBeVisible();
  });

  test("invalid property ID returns not-found", async ({ page }) => {
    const response = await page.goto("/properties/999");

    expect(response?.status()).toBe(404);
  });
});
