import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/bookings/booked-dates*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ bookings: [] }),
      }),
    );
    await page.goto("/");
  });

  test("page loads with heading", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("El Solar");
  });

  test("all 5 property cards rendered", async ({ page }) => {
    const propertyNames = [
      "Room 001",
      "Room 002",
      "Room 003",
      "Room 004",
      "Apartment Cave",
    ];

    for (const name of propertyNames) {
      await expect(page.locator(`text=${name}`).first()).toBeVisible();
    }
  });

  test("room cards show 30 USDC price", async ({ page }) => {
    const priceLabels = page.locator("text=30 USDC");
    await expect(priceLabels.first()).toBeVisible();
    const count = await priceLabels.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("Apartment Cave shows 75 USDC price", async ({ page }) => {
    await expect(page.locator("text=75 USDC").first()).toBeVisible();
  });

  test("shared amenities section present", async ({ page }) => {
    await expect(page.locator("text=Shared Amenities")).toBeVisible();
    const amenities = ["Pool", "Hiking Trails", "Fire Pit", "Private Parking"];
    for (const amenity of amenities) {
      await expect(page.locator(`text=${amenity}`).first()).toBeVisible();
    }
  });

  test("property cards link to detail pages", async ({ page }) => {
    const viewButtons = page.locator("text=View & Book");
    await expect(viewButtons.first()).toBeVisible();

    await viewButtons.first().click();
    await expect(page).toHaveURL(/\/properties\//);
  });
});
