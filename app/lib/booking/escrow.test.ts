import { describe, expect, it } from "bun:test";
import {
  bookingPhase,
  checkInCalendarDate,
  escrowCheckInTime,
  escrowRentTime,
  formatDeadline,
} from "./escrow";

describe("escrowCheckInTime", () => {
  it("is midnight UTC on the picked calendar day, whatever the local zone", () => {
    const picked = new Date(2026, 10, 20); // local Nov 20
    expect(escrowCheckInTime(picked).toISOString()).toBe(
      "2026-11-20T00:00:00.000Z",
    );
    expect(escrowRentTime(picked)).toBe(Date.UTC(2026, 10, 20) / 1000);
  });

  it("ignores the time of day of the picked date", () => {
    const picked = new Date(2026, 10, 20, 23, 59);
    expect(escrowCheckInTime(picked).toISOString()).toBe(
      "2026-11-20T00:00:00.000Z",
    );
  });
});

describe("checkInCalendarDate", () => {
  it("round-trips the picked calendar day through the on-chain instant", () => {
    const picked = new Date(2026, 10, 20);
    const day = checkInCalendarDate(escrowCheckInTime(picked));
    expect([day.getFullYear(), day.getMonth(), day.getDate()]).toEqual([
      2026, 10, 20,
    ]);
  });
});

describe("formatDeadline", () => {
  const deadline = new Date(Date.UTC(2026, 10, 20));

  it("shows a Colombian guest the evening before, with the zone named", () => {
    expect(formatDeadline(deadline, "en-US", "America/Bogota")).toMatch(
      /^Nov 19, 7:00\sPM GMT-5$/,
    );
  });

  it("shows a UTC guest midnight on the check-in day", () => {
    expect(formatDeadline(deadline, "en-US", "UTC")).toMatch(
      /^Nov 20, 12:00\sAM UTC$/,
    );
  });
});

describe("bookingPhase", () => {
  const checkInDate = new Date(Date.UTC(2026, 10, 20));
  const before = Date.UTC(2026, 10, 19, 23, 59);
  const at = checkInDate.getTime();

  it("is upcoming before check-in", () => {
    expect(bookingPhase({ checkInDate, rentEnded: false }, before)).toBe(
      "upcoming",
    );
  });

  it("is active from the check-in instant, as the program allows release", () => {
    expect(bookingPhase({ checkInDate, rentEnded: false }, at)).toBe("active");
  });

  it("is completed once the payment was released", () => {
    expect(bookingPhase({ checkInDate, rentEnded: true }, before)).toBe(
      "completed",
    );
  });
});
