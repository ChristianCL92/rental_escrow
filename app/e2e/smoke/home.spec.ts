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

  test("page loads with a single main heading", async ({ page }) => {
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toContainText("reconnect with nature");
  });

  test("brand fonts render: Figtree for text, Lora for headings", async ({
    page,
  }) => {
    // The font variables must resolve where Tailwind applies the base font
    // (<html>); otherwise every page silently falls back to the system font.
    const fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      const family = (selector: string) =>
        getComputedStyle(document.querySelector(selector)!).fontFamily;
      const loaded = (name: string) =>
        [...document.fonts].some(
          (face) =>
            face.family.replace(/["']/g, "") === name &&
            face.status === "loaded",
        );
      return {
        html: family("html"),
        body: family("body"),
        h1: family("h1"),
        h2: family("h2"),
        figtree: loaded("Figtree"),
        lora: loaded("Lora"),
      };
    });

    expect(fonts.html).toMatch(/^Figtree\b/);
    expect(fonts.body).toMatch(/^Figtree\b/);
    expect(fonts.h1).toMatch(/^Lora\b/);
    expect(fonts.h2).toMatch(/^Lora\b/);
    expect(fonts.figtree).toBe(true);
    expect(fonts.lora).toBe(true);
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
