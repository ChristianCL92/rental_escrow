import { test, expect } from "@playwright/test";

test.describe("Guest Bookings Page", () => {
  test("shows wallet connection prompt when no wallet connected", async ({
    page,
  }) => {
    await page.goto("/bookings");

    await expect(
      page.getByText("Connect your wallet to view your booking history"),
    ).toBeVisible();
    await expect(
      page.locator("main").getByRole("button", { name: "Connect wallet" }),
    ).toBeEnabled();
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
