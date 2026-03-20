import { test, expect } from "@playwright/test";

const TEST_PROPERTY_ID = "room-001";

test.describe("Booking Flow - API Mocking", () => {
  test.beforeEach(async ({ page }) => {
    // Mock booked-dates endpoint to return no bookings
    await page.route("**/api/bookings/booked-dates**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bookings: [] }),
      }),
    );

    await page.goto(`/properties/${TEST_PROPERTY_ID}`);
  });

  test("calendar loads with no disabled dates when API returns empty", async ({
    page,
  }) => {
    const calendar = page.locator('[data-slot="calendar"]');
    await expect(calendar).toBeVisible();

    // All future dates should be clickable
    const availableDays = page.locator(".rdp-day_button:not([disabled])");
    const count = await availableDays.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe("Booking Flow - Booked Dates Disabled", () => {
  test("previously booked dates appear disabled in calendar", async ({
    page,
  }) => {
    // Mock booked-dates with a known range
    const today = new Date();
    const checkIn = new Date(today);
    checkIn.setDate(today.getDate() + 5);
    const checkOut = new Date(today);
    checkOut.setDate(today.getDate() + 8);

    await page.route("**/api/bookings/booked-dates**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          bookings: [
            {
              check_in_date: checkIn.toISOString().split("T")[0],
              check_out_date: checkOut.toISOString().split("T")[0],
            },
          ],
        }),
      }),
    );

    await page.goto(`/properties/${TEST_PROPERTY_ID}`);

    const calendar = page.locator('[data-slot="calendar"]');
    await expect(calendar).toBeVisible();

    // Some future dates should now be disabled
    const disabledDays = page.locator(".rdp-day_button[disabled]");
    const count = await disabledDays.count();
    expect(count).toBeGreaterThan(0);
  });

  test("shows error state when booked-dates API fails", async ({ page }) => {
    await page.route("**/api/bookings/booked-dates**", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      }),
    );

    await page.goto(`/properties/${TEST_PROPERTY_ID}`);

    // Should display the dateError warning
    await expect(page.locator('[class*="bg-yellow"]')).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("Booking Flow - Button States", () => {
  test("button is disabled without wallet and without dates", async ({
    page,
  }) => {
    await page.goto(`/properties/${TEST_PROPERTY_ID}`);

    const bookButton = page.getByRole("button", {
      name: /connect wallet to book/i,
    });
    await expect(bookButton).toBeDisabled();
  });
});
