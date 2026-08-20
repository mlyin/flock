import { describe, expect, it } from "vitest";
import { MISSES_BEFORE_ASKING, detectVanished, type LiveListing } from "./vanished";

/**
 * The failure this guards against is a false positive: telling a seller to take
 * down a listing that is still for sale. Every test below is a scenario where a
 * naive implementation would do exactly that.
 */

const L = (over: Partial<LiveListing> = {}): LiveListing => ({
  id: "l1",
  item_id: "i1",
  external_id: "yumseller21-ivory-soho-pullover-brand-alo-ab33",
  url: "https://www.depop.com/products/yumseller21-ivory-soho-pullover-brand-alo-ab33/",
  absent_streak: 0,
  ...over,
});

describe("detectVanished", () => {
  it("an empty read flags nothing at all", () => {
    // The catastrophic case: a failed page load must never read as "everything sold".
    const result = detectVanished([L(), L({ id: "l2", external_id: "other-thing" })], []);
    expect(result.flag).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
    expect(result.skipped).toMatch(/empty/);
  });

  it("a listing present in the read is seen, never flagged", () => {
    const result = detectVanished([L()], [L().external_id!]);
    expect(result.seen).toHaveLength(1);
    expect(result.flag).toHaveLength(0);
  });

  it("one miss is not enough to ask — it only builds the streak", () => {
    const result = detectVanished([L({ absent_streak: 0 })], ["something-else"]);
    expect(result.flag).toHaveLength(0);
    expect(result.pending[0].misses).toBe(1);
  });

  it("the second consecutive miss is what raises the question", () => {
    const result = detectVanished([L({ absent_streak: 1 })], ["something-else"]);
    expect(result.flag).toHaveLength(1);
    expect(result.flag[0].misses).toBe(MISSES_BEFORE_ASKING);
  });

  it("matches on the url's slug when there's no external id", () => {
    const result = detectVanished([L({ external_id: null })], [L().external_id!]);
    expect(result.seen).toHaveLength(1);
  });

  it("ignores case, because slugs come back inconsistently cased", () => {
    const result = detectVanished([L()], [L().external_id!.toUpperCase()]);
    expect(result.seen).toHaveLength(1);
  });

  it("a listing with no id and no url is never judged", () => {
    // Nothing ever confirmed this went live, so its absence proves nothing.
    const result = detectVanished(
      [L({ external_id: null, url: null, absent_streak: 5 })],
      ["something-else"]
    );
    expect(result.flag).toHaveLength(0);
    expect(result.pending).toHaveLength(0);
  });

  it("survives a malformed url without throwing", () => {
    const result = detectVanished(
      [L({ external_id: null, url: "not a url", absent_streak: 5 })],
      ["x"]
    );
    expect(result.flag).toHaveLength(0);
  });

  it("separates the sold-looking one from the rest of a healthy shop", () => {
    const live = [
      L({ id: "a", external_id: "alpha", absent_streak: 1 }),
      L({ id: "b", external_id: "beta" }),
      L({ id: "c", external_id: "gamma" }),
    ];
    const result = detectVanished(live, ["beta", "gamma"]);
    expect(result.flag.map((f) => f.listing.id)).toEqual(["a"]);
    expect(result.seen.map((s) => s.id).sort()).toEqual(["b", "c"]);
  });
});
