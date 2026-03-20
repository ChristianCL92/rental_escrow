import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the hero tagline", async ({ page }) => {
    await expect(
      page.getByText("Disconnect from the routine, reconnect with nature."),
    ).toBeVisible();
  });

  test("displays all property cards", async ({ page }) => {
    const propertyCards = page.locator('[class*="overflow-hidden"]').filter({
      has: page.getByRole("button", { name: /view & book|not available/i }),
    });

    await expect(propertyCards).toHaveCount(5);
  });

  test("each property card shows name, price, and guest count", async ({
    page,
  }) => {
    // Check first card has essential info
    const firstCard = page
      .locator('[class*="overflow-hidden"]')
      .filter({
        has: page.getByRole("button", { name: /view & book|not available/i }),
      })
      .first();

    await expect(firstCard.getByText("USDC")).toBeVisible();
    await expect(firstCard.getByText(/up to \d+ guests/i)).toBeVisible();
    await expect(firstCard.getByText("per night")).toBeVisible();
  });

  test("displays shared amenities section", async ({ page }) => {
    await expect(page.getByText("Shared Amenities")).toBeVisible();

    const amenityItems = page
      .locator("section")
      .filter({ hasText: "Shared Amenities" })
      .locator('[class*="rounded-lg"]');

    const count = await amenityItems.count();
    expect(count).toBeGreaterThan(0);
  });

  test("property card navigates to property page", async ({ page }) => {
    const firstBookButton = page
      .getByRole("button", { name: "View & Book" })
      .first();
    await firstBookButton.click();

    await expect(page).toHaveURL(/\/properties\/.+/);
  });
});
