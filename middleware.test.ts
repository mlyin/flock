import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const mock = vi.hoisted(() => ({ getUser: vi.fn(), createClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => {
    mock.createClient(...args);
    return { auth: { getUser: mock.getUser } };
  },
}));

function request(path: string, signedIn = false) {
  return new NextRequest(`https://www.sellonflock.com${path}`, {
    headers: signedIn ? { cookie: "sb-test-auth-token=untrusted-cookie" } : {},
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
  mock.createClient.mockReset();
  mock.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("middleware during an authentication outage", () => {
  it("serves the signed-out homepage without constructing an auth client", async () => {
    const response = await middleware(request("/"));
    expect(response.status).toBe(200);
    expect(mock.createClient).not.toHaveBeenCalled();
  });

  it("leaves token/signature-authenticated routes and public assets to their own handlers", async () => {
    for (const path of ["/api/ext/queue", "/api/calendar/token", "/api/stripe/webhook", "/auth/callback", "/sw.js", "/brand/hero-1080.mp4"])
      expect((await middleware(request(path, true))).status).toBe(200);
    expect(mock.createClient).not.toHaveBeenCalled();
  });

  it("does not treat similarly prefixed private paths as public", async () => {
    for (const path of ["/login-admin", "/api/extension", "/authentication", "/pricing-private"])
      expect((await middleware(request(path))).status).toBe(307);
  });

  it("redirects unauthenticated private requests and preserves their query", async () => {
    const response = await middleware(request("/items/123?tab=offers"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).searchParams.get("next")).toBe("/items/123?tab=offers");
  });

  it("never accepts a cookie without verifying it", async () => {
    expect((await middleware(request("/settings", true))).status).toBe(307);
    expect(mock.getUser).toHaveBeenCalledOnce();
  });

  it("returns a retryable 503 for a hung protected request without deleting session cookies", async () => {
    vi.useFakeTimers();
    mock.getUser.mockImplementation(() => new Promise(() => {}));
    const pending = middleware(request("/settings", true));
    await vi.advanceTimersByTimeAsync(4_000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toContain("Try again");
  });

  it("lets public pages render after a stale cookie causes auth to hang", async () => {
    vi.useFakeTimers();
    mock.getUser.mockImplementation(() => new Promise(() => {}));
    const pending = middleware(request("/", true));
    await vi.advanceTimersByTimeAsync(4_000);
    expect((await pending).status).toBe(200);
  });

  it("distinguishes an upstream outage from an invalid session", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
    expect((await middleware(request("/settings", true))).status).toBe(503);
    mock.getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    expect((await middleware(request("/settings", true))).status).toBe(307);
  });

  it("still fails closed when configuration is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect((await middleware(request("/settings", true))).status).toBe(503);
  });

  it("keeps refreshed cookies on the signed-in login redirect", async () => {
    mock.getUser.mockImplementation(async () => {
      const options = mock.createClient.mock.calls[0][2];
      options.cookies.setAll([{ name: "sb-test-auth-token", value: "refreshed", options: { path: "/" } }]);
      return { data: { user: { id: "verified" } }, error: null };
    });
    const response = await middleware(request("/login", true));
    expect(response.headers.get("location")).toBe("https://www.sellonflock.com/");
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("refreshed");
  });
});
