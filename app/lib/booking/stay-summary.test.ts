import { describe, expect, it } from "bun:test";
import {
  compactStayDates,
  nightsLabel,
  spokenStaySummary,
} from "./stay-summary";

describe("nightsLabel", () => {
  it("is singular for one night and plural otherwise", () => {
    expect(nightsLabel(1)).toBe("1 night");
    expect(nightsLabel(3)).toBe("3 nights");
  });
});

describe("compactStayDates", () => {
  it("names the month once for a stay within one month", () => {
    expect(
      compactStayDates(new Date(2026, 10, 20), new Date(2026, 10, 23)),
    ).toBe("Nov 20-23");
  });

  it("names both months for a stay across a month end", () => {
    expect(
      compactStayDates(new Date(2026, 10, 28), new Date(2026, 11, 3)),
    ).toBe("Nov 28 - Dec 3");
  });

  it("names both months for a stay across a year end", () => {
    expect(compactStayDates(new Date(2026, 11, 30), new Date(2027, 0, 2))).toBe(
      "Dec 30 - Jan 2",
    );
  });
});

describe("spokenStaySummary", () => {
  it("spells the stay out without abbreviations or separators", () => {
    expect(
      spokenStaySummary(new Date(2026, 10, 20), new Date(2026, 10, 23), 3, 90),
    ).toBe("November 20 to November 23, 3 nights, 90 USDC total");
  });
});
