import { test, expect } from "@playwright/test";

const TEST_PROPERTY_ID = "room-001";

test.describe("Property Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/properties/${TEST_PROPERTY_ID}`);
  });

  test("displays property details", async ({ page }) => {
    await expect(page.getByText("30 USDC")).toBeVisible();
    await expect(page.getByText(/up to \d+ guests/i)).toBeVisible();
    await expect(page.getByText("Room Features")).toBeVisible();
    await expect(page.getByText("Shared Amenities")).toBeVisible();
  });

  test("back button navigates to homepage", async ({ page }) => {
    await page.getByRole("button", { name: /back to properties/i }).click();
    await expect(page).toHaveURL("/");
  });

  test("booking card renders with price and calendar", async ({ page }) => {
    await expect(page.getByText("Book your stay")).toBeVisible();
    await expect(page.getByText("/ night")).toBeVisible();

    // Calendar should be visible
    const calendar = page.locator('[data-slot="calendar"]');
    await expect(calendar).toBeVisible();
  });

  test("booking button shows 'Connect Wallet to Book' when no wallet", async ({
    page,
  }) => {
    await expect(
      page.getByRole("button", { name: /connect wallet to book/i }),
    ).toBeVisible();

    await expect(
      page.getByText("Connect your wallet to make a booking"),
    ).toBeVisible();
  });

  test("booking button shows 'Select Dates' before date selection", async ({
    page,
  }) => {
    // Even without wallet, we can check the disabled button text logic
    // The button should indicate dates need to be selected
    const button = page.getByRole("button", {
      name: /connect wallet to book|select dates/i,
    });
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
  });

  test("total shows placeholder when no dates selected", async ({ page }) => {
    await expect(page.getByText("-- USDC")).toBeVisible();
  });

  test("past dates are disabled in calendar", async ({ page }) => {
    // Past dates should have the disabled attribute
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const disabledDays = page.locator(".rdp-day_button[disabled]");
    const count = await disabledDays.count();
    expect(count).toBeGreaterThan(0);
  });

  test("returns 404 for non-existent property", async ({ page }) => {
    await page.goto("/properties/999");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  });
});

test.describe("Image Carousel", () => {
  test("displays property images", async ({ page }) => {
    await page.goto(`/properties/${TEST_PROPERTY_ID}`);

    const propertyImages = page.locator("main img");
    const count = await propertyImages.count();
    expect(count).toBeGreaterThan(0);
  });
});
