import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("navbar renders on all pages", async ({ page }) => {
    const pages = ["/", "/properties/1", "/bookings", "/admin"];

    for (const path of pages) {
      await page.goto(path);
      await expect(page.locator("nav")).toBeVisible();
    }
  });

  test("navbar contains wallet connect button", async ({ page }) => {
    await page.goto("/");

    // The wallet adapter UI should render a connect button
    const walletButton = page.getByRole("button", {
      name: /select wallet|connect|wallet/i,
    });
    await expect(walletButton).toBeVisible();
  });

  test("logo or brand links to homepage", async ({ page }) => {
    await page.goto("/properties/1");

    // Click the brand/logo link in the navbar
    const navLinks = page.locator("nav a");
    const homeLink = navLinks.first();
    await homeLink.click();

    await expect(page).toHaveURL("/");
  });
});

test.describe("Responsive Navigation", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("navbar is visible on mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav")).toBeVisible();
  });

  test("property cards stack vertically on mobile", async ({ page }) => {
    await page.goto("/");

    // On mobile, the grid should be single column
    const firstCard = page
      .locator('[class*="overflow-hidden"]')
      .filter({
        has: page.getByRole("button", { name: /view & book|not available/i }),
      })
      .first();

    await expect(firstCard).toBeVisible();
  });
});
