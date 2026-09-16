/**
 * The request-shape checks every /api/m route leans on. A list with one bad
 * id must be refused whole rather than trimmed — a seller who sent twelve
 * photos and got a garment out of eleven would never know which one was
 * dropped. Unknown fields on a PATCH are dropped, not refused, so an app a
 * version ahead of the server still saves the fields the server knows.
 */
import { describe, expect, it } from "vitest";
import { pickItemFields } from "./item-fields";
import { idList, mjson, readJson } from "./mobile-auth";

const A = "11111111-2222-4333-8444-555555555555";
const B = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";

describe("idList", () => {
  it("accepts a list of uuids, either case", () => {
    expect(idList([A, B])).toEqual([A, B]);
  });

  it("refuses the whole list when one entry is not a uuid", () => {
    expect(idList([A, "not-an-id"])).toBeNull();
    expect(idList([A, 42])).toBeNull();
    expect(idList([A, null])).toBeNull();
  });

  it("refuses anything that is not a list", () => {
    expect(idList(A)).toBeNull();
    expect(idList({ 0: A })).toBeNull();
    expect(idList(undefined)).toBeNull();
  });

  it("caps at max and returns an empty list for an empty list", () => {
    expect(idList([A, B, A], 2)).toEqual([A, B]);
    expect(idList([])).toEqual([]);
  });
});

describe("readJson", () => {
  const req = (body: string) =>
    new Request("http://flock.test/api/m/x", { method: "POST", body, headers: { "content-type": "application/json" } });

  it("returns an object body", async () => {
    expect(await readJson(req('{"a":1}'))).toEqual({ a: 1 });
  });

  it("returns null for arrays, scalars, and unparseable bodies", async () => {
    expect(await readJson(req("[1,2]"))).toBeNull();
    expect(await readJson(req('"x"'))).toBeNull();
    expect(await readJson(req("null"))).toBeNull();
    expect(await readJson(req("{not json"))).toBeNull();
    expect(await readJson(req(""))).toBeNull();
  });
});

describe("mjson", () => {
  it("is JSON, uncached, with the status asked for", async () => {
    const res = mjson({ ok: false, error: "no" }, 422);
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: false, error: "no" });
  });
});

describe("pickItemFields", () => {
  it("keeps garment fields and drops the rest", () => {
    expect(pickItemFields({ title: "Tee", list_price: 40, notes: null, status: "sold", user_id: "x" })).toEqual({
      title: "Tee",
      list_price: 40,
      notes: null,
    });
  });

  it("joins a flaws list into one line per flaw", () => {
    expect(pickItemFields({ flaws: ["pilling", 7, "small hole"] })).toEqual({ flaws: "pilling\nsmall hole" });
    expect(pickItemFields({ flaws: "one\ntwo" })).toEqual({ flaws: "one\ntwo" });
  });

  it("drops values of the wrong type instead of saving them", () => {
    expect(pickItemFields({ title: { nested: true }, brand: ["x"], size: true })).toEqual({});
  });
});
