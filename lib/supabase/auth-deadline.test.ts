import { afterEach, describe, expect, it, vi } from "vitest";
import { authFetch, AuthUnavailableError, hasAuthCookie, withAuthDeadline } from "./auth-deadline";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("authentication deadline", () => {
  it("returns successful verification and clears its timer", async () => {
    vi.useFakeTimers();
    expect(await withAuthDeadline(async () => "verified")).toBe("verified");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a hung SDK operation and aborts the underlying request", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const result = withAuthDeadline((value) => {
      signal = value;
      return new Promise(() => {});
    });
    const assertion = expect(result).rejects.toBeInstanceOf(AuthUnavailableError);
    await vi.advanceTimersByTimeAsync(4_000);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });

  it("preserves a caller abort signal as well as the deadline", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", fetchMock);
    const deadline = new AbortController();
    const caller = new AbortController();
    await authFetch(deadline.signal)("https://example.com", { signal: caller.signal });
    caller.abort();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

describe("session cookie presence", () => {
  const url = "https://flock-test.supabase.co";
  it("recognizes whole and chunked session cookies", () => {
    for (const name of ["sb-flock-test-auth-token", "sb-flock-test-auth-token.0", "sb-flock-test-auth-token.1"])
      expect(hasAuthCookie([{ name, value: "untrusted" }], url)).toBe(true);
  });
  it("ignores other projects, the PKCE verifier, empty cookies and lookalike names", () => {
    expect(hasAuthCookie([], url)).toBe(false);
    for (const name of ["sb-other-auth-token", "sb-flock-test-auth-token-code-verifier", "sb-flock-test-auth-token.x"])
      expect(hasAuthCookie([{ name, value: "x" }], url)).toBe(false);
    expect(hasAuthCookie([{ name: "sb-flock-test-auth-token", value: "" }], url)).toBe(false);
  });
});
