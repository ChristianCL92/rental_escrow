import { test, expect } from "@playwright/test";

test.describe("Admin Dashboard", () => {
  test("restricts access when no wallet connected", async ({ page }) => {
    await page.goto("/admin");

    // Admin page should indicate owner wallet is required
    await expect(
      page.getByText(/connect.*wallet|owner|unauthorized|not authorized/i),
    ).toBeVisible();
  });

  test("page loads without crashing", async ({ page }) => {
    await page.goto("/admin");

    // Even without proper auth, the page should render
    await expect(page.locator("main")).toBeVisible();
  });
});
