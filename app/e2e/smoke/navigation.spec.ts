import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
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

  test("NavBar visible on home page", async ({ page }) => {
    await page.goto("/");

    // Logo image and nav should be visible
    await expect(page.locator("nav")).toBeVisible();
    await expect(
      page.locator('img[alt="El Solar Logo"]'),
    ).toBeVisible();
  });

  test("navigate to My Bookings", async ({ page }) => {
    await page.goto("/");

    await page.locator("text=My Bookings").click();
    await expect(page).toHaveURL("/bookings");
  });

  test("navigate back to home via logo", async ({ page }) => {
    await page.goto("/bookings");

    await page.locator('img[alt="El Solar Logo"]').click();
    await expect(page).toHaveURL("/");
  });

  test("wallet connect button present", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.locator(".wallet-adapter-button"),
    ).toBeVisible();
  });
});
