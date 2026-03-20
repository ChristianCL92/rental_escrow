import { test, expect } from "@playwright/test";

test.describe("Guest Bookings Page", () => {
  test("shows wallet connection prompt when no wallet connected", async ({
    page,
  }) => {
    await page.goto("/bookings");

    // Without a wallet, page should indicate connection is needed
    await expect(page.getByText(/connect.*wallet|no wallet/i)).toBeVisible();
  });

  test("has navigation back to properties", async ({ page }) => {
    await page.goto("/bookings");

    const backButton = page.getByRole("link", {
      name: /back to properties/i,
    });
    await expect(backButton).toBeVisible();

    await backButton.click();
    await expect(page).toHaveURL("/");
  });
});
