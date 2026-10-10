// Auth refresh may retry while a project is paused. Bound the whole operation,
// not just one fetch, so middleware responds before Vercel's invocation limit.
export const AUTH_TIMEOUT_MS = 4_000;

export class AuthUnavailableError extends Error {
  constructor() {
    super("Authentication is temporarily unavailable");
    this.name = "AuthUnavailableError";
  }
}

export async function withAuthDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = AUTH_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new AuthUnavailableError());
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Pass the operation deadline through to the SDK's HTTP requests and retries. */
export function authFetch(signal: AbortSignal): typeof fetch {
  return (input, init) => {
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    return fetch(input, {
      ...init,
      signal: callerSignal ? AbortSignal.any([signal, callerSignal]) : signal,
    });
  };
}

// Presence is only an optimization for signed-out visitors, never proof of identity.
export function hasAuthCookie(cookies: { name: string; value: string }[], url: string): boolean {
  const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  return cookies.some(({ name, value }) => Boolean(value) && (
    name === key || (name.startsWith(`${key}.`) && /^\d+$/.test(name.slice(key.length + 1)))
  ));
}
