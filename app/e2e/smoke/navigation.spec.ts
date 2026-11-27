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
      page.getByRole("navigation").getByRole("link", { name: "El Solar" }),
    ).toBeVisible();
  });

  test("navigate to My Bookings", async ({ page }) => {
    await page.goto("/");

    await page.locator("text=My Bookings").click();
    await expect(page).toHaveURL("/bookings");
  });

  test("navigate back to home via logo", async ({ page }) => {
    await page.goto("/bookings");

    await page
      .getByRole("navigation")
      .getByRole("link", { name: "El Solar" })
      .click();
    await expect(page).toHaveURL("/");
  });

  for (const { name, width, height } of [
    { name: "phone", width: 390, height: 844 },
    { name: "desktop", width: 1440, height: 900 },
  ]) {
    test(`pages start below the fixed nav on ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      for (const path of ["/", "/properties/room-001", "/bookings"]) {
        await page.goto(path);
        // The site nav comes first; the booking calendar has a <nav> too.
        const nav = (await page.locator("nav").first().boundingBox())!;
        const content = (await page
          .getByRole("main")
          .locator("> *")
          .first()
          .boundingBox())!;
        expect(content.y, path).toBeGreaterThanOrEqual(nav.y + nav.height);
        // ...and directly below it, with no gap over the full-bleed hero.
        expect(content.y - (nav.y + nav.height), path).toBeLessThan(1);
      }
    });
  }

  test("wallet connect button present", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.locator("nav").getByRole("button", { name: "Connect wallet" }),
    ).toBeVisible();
  });
});
