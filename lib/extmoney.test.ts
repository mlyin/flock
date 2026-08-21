import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Tests the extension's own money parser by evaluating the shipped file.
 *
 * Content scripts can't be imported — no modules, no bundler — so the choice
 * was a second copy of the logic under test or evaluating the real one. A
 * second copy would have passed while the shipped regex stayed broken, which
 * is exactly the failure this file exists to prevent.
 */
const source = readFileSync(join(process.cwd(), "extension", "money.js"), "utf8");
const parseMoney = new Function(`${source}; return parseMoney;`)() as (
  raw: string
) => number | null;

describe("parseMoney", () => {
  it("reads plain prices", () => {
    expect(parseMoney("29.99")).toBe(29.99);
    expect(parseMoney("30")).toBe(30);
    expect(parseMoney("$45.00")).toBe(45);
  });

  it("reads thousands separators — the bug this exists for", () => {
    // "$1,250.00" used to parse as 1, which then sat at the top of the
    // price-drift queue as a one-click "Use $1.00".
    expect(parseMoney("1,250.00")).toBe(1250);
    expect(parseMoney("$1,250.00")).toBe(1250);
    expect(parseMoney("12,500")).toBe(12500);
    expect(parseMoney("1,234,567.89")).toBe(1234567.89);
  });

  it("reads European formatting", () => {
    // The nastier half: 1.250,00 parsed as 1.25 looks like a real price
    // rather than a failed read, so nothing downstream flags it.
    expect(parseMoney("1.250,00")).toBe(1250);
    expect(parseMoney("€1.250,00")).toBe(1250);
    expect(parseMoney("29,99")).toBe(29.99);
    expect(parseMoney("1.234.567,89")).toBe(1234567.89);
  });

  it("treats three digits after a lone separator as a group, not a decimal", () => {
    // "1,250" and "1.250" are a thousand-something in some locale and 1.25 in
    // none. There is no currency where a price carries three decimal places
    // on a marketplace card.
    expect(parseMoney("1,250")).toBe(1250);
    expect(parseMoney("1.250")).toBe(1250);
  });

  it("strips currency symbols and whitespace", () => {
    expect(parseMoney("£ 80.00")).toBe(80);
    expect(parseMoney(" $15.50 ")).toBe(15.5);
    expect(parseMoney("USD 22.00")).toBe(22);
  });

  it("returns null rather than a wrong number", () => {
    // A failed read must be distinguishable from a free item — lib/drift.ts
    // treats 0 as a failed read for exactly this reason.
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("Sold")).toBeNull();
    expect(parseMoney("--")).toBeNull();
    expect(parseMoney(null as unknown as string)).toBeNull();
  });

  it("never turns a large price into a small one", () => {
    // The property that actually matters: whatever the formatting, a
    // four-figure listing must never come back as single digits.
    for (const text of ["$1,250.00", "€1.250,00", "1250", "1,250", "1.250", "$1 250,00"]) {
      const value = parseMoney(text);
      expect(value, text).not.toBeNull();
      expect(value!, text).toBeGreaterThan(1000);
    }
  });
});
