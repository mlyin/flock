import { describe, expect, it } from "vitest";
import { daysSince, shortDate, usd } from "./money";

describe("usd", () => {
  it("formats cents faithfully", () => {
    expect(usd(118.42)).toBe("$118.42");
    expect(usd(0)).toBe("$0.00");
    expect(usd(-13)).toBe("-$13.00");
  });
});

describe("date helpers survive the inputs the DB actually produces", () => {
  it("date-only strings parse as UTC, not local midnight", () => {
    expect(shortDate("2026-01-25")).toBe("Jan 25, 2026");
  });
  it("timestamps pass through", () => {
    expect(shortDate("2026-08-17T19:08:23.672Z")).toBe("Aug 17, 2026");
  });
  it("garbage degrades to a dash, never NaN in the UI", () => {
    expect(shortDate("not-a-date")).toBe("—");
    expect(shortDate(null)).toBe("—");
    expect(daysSince("not-a-date")).toBeNull();
  });
});
