import { test, expect } from "@playwright/test";

test.describe("POST /api/bookings/availability", () => {
  test("available dates return available=true", async ({ page }) => {
    await page.route("**/api/bookings/availability", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: true, conflicts: [] }),
      }),
    );

    await page.goto("/");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/bookings/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartmentId: 1,
          checkInDate: "2026-04-10",
          checkOutDate: "2026-04-15",
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body.available).toBe(true);
    expect(result.body.conflicts).toEqual([]);
  });

  test("conflicting dates return available=false", async ({ page }) => {
    await page.route("**/api/bookings/availability", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          available: false,
          conflicts: [
            {
              id: "1",
              check_in_date: "2026-04-10",
              check_out_date: "2026-04-15",
              status: "confirmed",
            },
          ],
        }),
      }),
    );

    await page.goto("/");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/bookings/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartmentId: 1,
          checkInDate: "2026-04-10",
          checkOutDate: "2026-04-15",
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body.available).toBe(false);
    expect(result.body.conflicts).toHaveLength(1);
    expect(result.body.conflicts[0].check_in_date).toBe("2026-04-10");
    expect(result.body.conflicts[0].status).toBe("confirmed");
  });

  test("missing params return 400", async ({ page }) => {
    await page.route("**/api/bookings/availability", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "request failed, data not available",
        }),
      }),
    );

    await page.goto("/");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/bookings/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("request failed, data not available");
  });
});
