import { test, expect, type Page } from "@playwright/test";

const mockBookedDates = async (page: Page) => {
  await page.route("**/api/bookings/booked-dates*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ bookings: [] }),
    }),
  );
};

/** Describes the focused element as "TAG accessible-ish name". */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim();
    return `${el.tagName} ${name}`;
  });

/** Presses Tab until `predicate` matches the focused element, or gives up. */
const tabUntil = async (
  page: Page,
  predicate: (description: string) => boolean,
  maxPresses = 30,
) => {
  for (let i = 0; i < maxPresses; i++) {
    await page.keyboard.press("Tab");
    const description = await focused(page);
    if (predicate(description)) return description;
  }
  throw new Error("Focus never reached the expected element");
};

test.describe("Keyboard and screen-reader basics", () => {
  test.beforeEach(async ({ page }) => {
    await mockBookedDates(page);
  });

  for (const path of [
    "/",
    "/properties/room-001",
    "/properties/apartment-cave",
    "/bookings",
    "/tools/marketing",
  ]) {
    test(`${path} has one main landmark and one h1`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toBeVisible();
    });
  }

  test("no link wraps a button", async ({ page }) => {
    for (const path of ["/", "/properties/room-001", "/bookings"]) {
      await page.goto(path);
      await expect(page.locator("a button, button a")).toHaveCount(0);
    }
  });

  test("Back to Properties is a single tab stop", async ({ page }) => {
    await page.goto("/properties/room-001");
    const first = await tabUntil(page, (d) => d.includes("Back to Properties"));
    expect(first.startsWith("A ")).toBe(true);
    await page.keyboard.press("Tab");
    expect(await focused(page)).not.toContain("Back to Properties");
  });

  test("nav brand is a link home that stays named on phones", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/bookings");
    const brand = page
      .getByRole("navigation")
      .getByRole("link", { name: "El Solar" });
    await expect(brand).toBeVisible();
    await brand.click();
    await expect(page).toHaveURL("/");
  });

  test("nav controls show a solid light focus outline", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as Element);
      return `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`;
    });
    expect(outline).toBe("solid 2px rgb(255, 255, 255)");
  });

  test("photo carousel works by keyboard and announces position", async ({
    page,
  }) => {
    await page.goto("/properties/apartment-cave");
    const carousel = page.getByRole("region", {
      name: "Apartment Cave photos",
    });
    const photo = carousel.getByRole("img");
    const firstAlt = await photo.getAttribute("alt");
    expect(firstAlt).toBeTruthy();
    await expect(carousel.getByText("1 / 4")).toBeVisible();

    await tabUntil(page, (d) => d.includes("Next photo"));
    await page.keyboard.press("Enter");
    await expect(carousel.getByText("2 / 4")).toBeVisible();
    await expect(carousel.getByRole("status")).toContainText("Photo 2 of 4");
    expect(await photo.getAttribute("alt")).not.toBe(firstAlt);

    await page.keyboard.press("Shift+Tab");
    expect(await focused(page)).toContain("Previous photo");
    await page.keyboard.press(" ");
    await expect(carousel.getByText("1 / 4")).toBeVisible();

    await page.keyboard.press("ArrowLeft");
    await expect(carousel.getByText("4 / 4")).toBeVisible();
  });

  test("single-photo properties show no carousel controls", async ({
    page,
  }) => {
    await page.goto("/properties/room-001");
    await expect(page.getByRole("button", { name: /photo/i })).toHaveCount(0);
  });

  test("calendar days are 44px tap targets on phones", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/properties/room-001");
    const day = page.locator("button[data-day]").first();
    const box = await day.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("calendar days stay compact on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/properties/room-001");
    const box = await page.locator("button[data-day]").first().boundingBox();
    expect(box!.width).toBeLessThan(40);
  });
});
