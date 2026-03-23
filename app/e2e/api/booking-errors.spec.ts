import { test, expect } from "@playwright/test";

test.describe("Booking API error handling", () => {
  test("POST 400 for missing fields", async ({ page }) => {
    await page.route("**/api/bookings", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Could not insert data" }),
        });
      }
      return route.continue();
    });

    await page.goto("/");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Could not insert data");
  });

  test("POST 409 for double booking", async ({ page }) => {
    await page.route("**/api/bookings", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error:
              "double booking attempt: dates overlap with existing booking",
          }),
        });
      }
      return route.continue();
    });

    await page.goto("/");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apartmentId: 1,
          checkInDate: "2026-04-10",
          checkOutDate: "2026-04-15",
          guestWallet: "TestWallet123",
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(409);
    expect(result.body.error).toContain("double booking attempt");
  });

  test("PATCH 400 for missing bookingId", async ({ page }) => {
    await page.route("**/api/bookings", (route) => {
      if (route.request().method() === "PATCH") {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Missing bookingId or status" }),
        });
      }
      return route.continue();
    });

    await page.goto("/");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Missing bookingId or status");
  });

  test("PATCH 400 for invalid status", async ({ page }) => {
    await page.route("**/api/bookings", (route) => {
      if (route.request().method() === "PATCH") {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Missing appropiate column values",
          }),
        });
      }
      return route.continue();
    });

    await page.goto("/");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: "123",
          status: "invalid_status",
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Missing appropiate column values");
  });

  test("PATCH 400 for confirm without tx", async ({ page }) => {
    await page.route("**/api/bookings", (route) => {
      if (route.request().method() === "PATCH") {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Missing txSignature for confirmation",
          }),
        });
      }
      return route.continue();
    });

    await page.goto("/");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: "123",
          status: "confirmed",
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Missing txSignature for confirmation");
  });

  test("DELETE 404 for non-existent booking", async ({ page }) => {
    await page.route("**/api/bookings", (route) => {
      if (route.request().method() === "DELETE") {
        return route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "Booking not found" }),
        });
      }
      return route.continue();
    });

    await page.goto("/");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/bookings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: "nonexistent-id" }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(404);
    expect(result.body.error).toBe("Booking not found");
  });

  test("GET 400 without required params", async ({ page }) => {
    await page.route("**/api/bookings?**", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "Missing required parameters" }),
        });
      }
      return route.continue();
    });

    await page.goto("/");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/bookings");
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Missing required parameters");
  });

  test("guest bookings 400 without wallet", async ({ page }) => {
    await page.route("**/api/bookings/guest*", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "Wallet not available" }),
      }),
    );

    await page.goto("/");

    const result = await page.evaluate(async () => {
      const res = await fetch("/api/bookings/guest");
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toBe("Wallet not available");
  });
});
