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
    await expect(page.locator("h1")).toHaveText(
      "Backpacker & holistic retreat",
    );
  });

  test("hero shows the photo, where El Solar is, and one action", async ({
    page,
  }) => {
    const hero = page.getByRole("region", {
      name: "Backpacker & holistic retreat",
    });
    const photo = hero.getByRole("img", { name: /pool.*EL SOLAR sign/ });
    await expect(photo).toBeVisible();
    // The photo is the largest paint, so it must not wait for lazy loading.
    await expect(photo).not.toHaveAttribute("loading", "lazy");
    await expect(hero.getByText("Colombian Andes")).toBeVisible();
    await expect(hero.getByRole("link", { name: "Check dates" })).toBeVisible();
    // Browsing needs no wallet, so the hero offers none.
    await expect(hero.getByRole("button")).toHaveCount(0);
    await expect(hero.getByText(/wallet/i)).toHaveCount(0);
  });

  test("Check dates scrolls to the stays, clear of the nav", async ({
    page,
  }) => {
    await page.getByRole("link", { name: "Check dates" }).click();
    await expect(page).toHaveURL(/#stays$/);
    const heading = page.getByRole("heading", { name: "Stays", level: 2 });
    await expect(heading).toBeInViewport();
    // Smooth scrolling animates, so wait for it to settle before measuring.
    await expect
      .poll(async () => {
        const navBottom = (await page.locator("nav").boundingBox())!;
        const top = (await heading.boundingBox())!.y;
        return top >= navBottom.y + navBottom.height;
      })
      .toBe(true);
  });

  test("hero leaves a peek of the stays above the fold", async ({ page }) => {
    const viewport = page.viewportSize()!;
    const hero = (await page
      .getByRole("region", { name: "Backpacker & holistic retreat" })
      .boundingBox())!;
    expect(hero.y + hero.height).toBeLessThan(viewport.height);
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
    const stays = page.getByRole("region", { name: "Stays" });
    const propertyNames = [
      "Room 01",
      "Room 02",
      "Room 03",
      "Room 04",
      "Cave apartment",
    ];

    for (const name of propertyNames) {
      await expect(
        stays.getByRole("heading", { name, level: 3 }),
      ).toBeVisible();
    }
    await expect(page.getByTestId("property-card")).toHaveCount(5);
  });

  test("each room has its own description", async ({ page }) => {
    const cards = page.getByTestId("property-card");
    await expect(cards.nth(0)).toContainText(
      "Panoramic room with a view of the mountain range and the nature reserve.",
    );
    await expect(cards.nth(1)).toContainText(
      "Panoramic room with a balcony and a view of the mountain range.",
    );
    await expect(
      page.getByText("Cozy room with double bed and private bathroom."),
    ).toHaveCount(0);
  });

  test("room cards show the price as 30 USDC / night", async ({ page }) => {
    const rooms = page.getByRole("list", { name: "Rooms" });
    await expect(rooms.getByText("30 USDC / night")).toHaveCount(4);
  });

  test("Cave apartment shows 75 USDC / night", async ({ page }) => {
    const apartments = page.getByRole("list", { name: "Apartments" });
    await expect(apartments.getByText("75 USDC / night")).toBeVisible();
  });

  test("type labels read in title case", async ({ page }) => {
    const rooms = page.getByRole("list", { name: "Rooms" });
    await expect(rooms.getByText("Room", { exact: true })).toHaveCount(4);
    const apartments = page.getByRole("list", { name: "Apartments" });
    await expect(
      apartments.getByText("Apartment", { exact: true }),
    ).toBeVisible();
  });

  test("photos sit flush with the top of the card, in a 4:3 shape", async ({
    page,
  }) => {
    const cards = page.getByTestId("property-card");
    for (let i = 0; i < 5; i++) {
      const card = (await cards.nth(i).boundingBox())!;
      const photo = (await cards.nth(i).getByRole("img").boundingBox())!;
      // Only the 1px card border sits above the photo.
      expect(photo.y - card.y).toBeLessThanOrEqual(1);
      expect(photo.width / photo.height).toBeCloseTo(4 / 3, 1);
    }
  });

  test("the four rooms fill one row on laptops, the apartment its own row", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const rooms = page
      .getByRole("list", { name: "Rooms" })
      .getByRole("listitem");
    await expect(rooms).toHaveCount(4);
    const tops = await Promise.all(
      [0, 1, 2, 3].map(async (i) => (await rooms.nth(i).boundingBox())!.y),
    );
    expect(new Set(tops).size).toBe(1);

    const roomRow = (await page
      .getByRole("list", { name: "Rooms" })
      .boundingBox())!;
    const cave = (await page
      .getByRole("list", { name: "Apartments" })
      .getByTestId("property-card")
      .boundingBox())!;
    // The apartment spans the whole row under the rooms: no empty slot.
    expect(cave.y).toBeGreaterThan(roomRow.y + roomRow.height);
    expect(Math.abs(cave.width - roomRow.width)).toBeLessThan(1);
  });

  test("cards have no buttons; each is one link named after the stay", async ({
    page,
  }) => {
    const cards = page.getByTestId("property-card");
    await expect(cards.getByRole("button")).toHaveCount(0);
    await expect(page.getByText("View & Book")).toHaveCount(0);
    for (let i = 0; i < 5; i++) {
      await expect(cards.nth(i).getByRole("link")).toHaveCount(1);
      await expect(cards.nth(i).getByText("View dates")).toBeVisible();
    }
    await expect(
      cards.first().getByRole("link", { name: "Room 01" }),
    ).toHaveAttribute("href", "/properties/room-001");
  });

  test("clicking anywhere on a card opens the stay", async ({ page }) => {
    // A point on the photo, far from the name: the name's link is
    // stretched over the whole card, so it takes the click.
    await page
      .getByTestId("property-card")
      .filter({ hasText: "Cave apartment" })
      .click({ position: { x: 24, y: 48 } });
    // A navigation, so wait as long as one may take: the dev server can
    // still be compiling the page on its first visit.
    await page.waitForURL(/\/properties\/apartment-cave$/);
    await expect(
      page.getByRole("heading", { name: "Cave apartment", level: 1 }),
    ).toBeVisible();
  });

  test("a hovered card lifts and zooms its photo", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Touch screens have no hover.");
    const card = page.getByTestId("property-card").first();
    await card.hover();
    await expect
      .poll(() =>
        card.evaluate((el) => ({
          lift: getComputedStyle(el).translate,
          zoom: getComputedStyle(el.querySelector("img")!).scale,
        })),
      )
      .toEqual({ lift: "0px -4px", zoom: "1.04" });
  });

  test("the footer reads © year El Solar", async ({ page }) => {
    await expect(page.locator("footer")).toContainText(
      `© ${new Date().getFullYear()} El Solar`,
    );
    await expect(page.locator("footer")).not.toContainText("Copyright");
  });

  test("shared amenities section present", async ({ page }) => {
    await expect(page.locator("text=Shared Amenities")).toBeVisible();
    const amenities = ["Pool", "Hiking Trails", "Fire Pit", "Private Parking"];
    for (const amenity of amenities) {
      await expect(page.locator(`text=${amenity}`).first()).toBeVisible();
    }
  });

  test("property cards link to detail pages", async ({ page }) => {
    await page.getByTestId("property-card").first().click();
    await page.waitForURL(/\/properties\/room-001$/);
  });
});
