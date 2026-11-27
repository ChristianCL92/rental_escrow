import { describe, expect, it } from "bun:test";
import { formatUsdc } from "./money";

describe("formatUsdc", () => {
  it("puts the unit after the number, joined by a non-breaking space", () => {
    expect(formatUsdc(30)).toBe("30 USDC");
  });

  it("groups thousands and drops trailing zeros", () => {
    expect(formatUsdc(1050)).toBe("1,050 USDC");
    expect(formatUsdc(22.5)).toBe("22.5 USDC");
  });

  it("rounds to cents", () => {
    expect(formatUsdc(0.123456)).toBe("0.12 USDC");
  });
});
