/**
 * Exists to catch two cheap mistakes with expensive consequences: a bearer
 * from one request leaking into another (every /api/m route would then act
 * as the wrong seller), and a non-JWT string being forwarded to Supabase as
 * if it were a session.
 */
import { describe, expect, it } from "vitest";
import { currentBearer, parseBearer, withBearer } from "./bearer-context";

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.c2lnbmF0dXJl";

describe("parseBearer", () => {
  it("takes a JWT with or without the Bearer prefix and trims it", () => {
    expect(parseBearer(`Bearer ${JWT}`)).toBe(JWT);
    expect(parseBearer(`bearer ${JWT}`)).toBe(JWT);
    expect(parseBearer(`  ${JWT}  `)).toBe(JWT);
  });

  it("refuses anything that is not three base64url segments", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer("Bearer ")).toBeNull();
    // An extension pairing code: uppercase groups with dashes, no dots.
    expect(parseBearer("Bearer ABC123-DEF456-GHI789-JKL012")).toBeNull();
    // A publishable key.
    expect(parseBearer("Bearer sb_publishable_abc")).toBeNull();
    expect(parseBearer("Bearer a.b")).toBeNull();
    expect(parseBearer("Bearer a.b.c.d")).toBeNull();
  });
});

describe("withBearer", () => {
  it("is visible inside the callback and nowhere else", async () => {
    expect(currentBearer()).toBeNull();
    const seen = await withBearer(JWT, async () => {
      await new Promise((r) => setTimeout(r, 1));
      return currentBearer();
    });
    expect(seen).toBe(JWT);
    expect(currentBearer()).toBeNull();
  });

  it("keeps two concurrent requests apart", async () => {
    const other = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4eXoifQ.b3RoZXI";
    const [a, b] = await Promise.all([
      withBearer(JWT, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return currentBearer();
      }),
      withBearer(other, async () => {
        await new Promise((r) => setTimeout(r, 1));
        return currentBearer();
      }),
    ]);
    expect(a).toBe(JWT);
    expect(b).toBe(other);
  });
});
