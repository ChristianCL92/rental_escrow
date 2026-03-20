import { test, expect } from "@playwright/test";

test.describe("GET /api/bookings/booked-dates", () => {
  test("calendar shows disabled dates for booked ranges", async ({ page }) => {
    await page.route("**/api/bookings/booked-dates*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          bookings: [
            {
              check_in_date: "2026-04-10",
              check_out_date: "2026-04-15",
            },
          ],
        }),
      }),
    );

    await page.goto("/properties/room-001");
    await page.waitForSelector("text=Book your stay");

    while (!(await page.locator("text=April 2026").isVisible())) {
      await page.locator(".rdp-button_next").click();
    }

    // Dates 10-14 should be disabled (check_out date 15 is excluded by the slice(0,-1) logic)
    // Day buttons in April are inside the month that contains "April 2026"
    for (const day of [10, 11, 12, 13, 14]) {
      const cell = page
        .locator(`td[data-disabled="true"] button`)
        .filter({ hasText: new RegExp(`^${day}$`) });
      const count = await cell.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  test("calendar has no disabled dates when no bookings", async ({ page }) => {
    await page.route("**/api/bookings/booked-dates*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bookings: [] }),
      }),
    );

    await page.goto("/properties/room-001");
    await page.waitForSelector("text=Book your stay");

    await page.locator(".rdp-button_next").click();
    await page.locator(".rdp-button_next").click();

    const enabledDays = page.locator(
      "td:not([data-disabled]) button[data-day]",
    );
    const count = await enabledDays.count();
    expect(count).toBeGreaterThan(0);
  });

  test("error banner shown when booked-dates API fails", async ({ page }) => {
    await page.route("**/api/bookings/booked-dates*", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "DB query failed" }),
      }),
    );

    await page.goto("/properties/room-001");

    const banner = page.locator(".bg-yellow-200");
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner).toContainText("DB query failed");
  });
});
