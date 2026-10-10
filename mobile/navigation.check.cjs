const { test } = require("node:test");
const assert = require("node:assert/strict");
const { navigationTarget, notificationTarget } = require("./navigation.cjs");

test("Flock and existing OAuth hosts stay in the WebView", () => {
  for (const url of [
    "https://www.sellonflock.com/items/123", "https://sellonflock.com/login",
    "https://WWW.SELLONFLOCK.COM:443/", "https://accounts.google.com/o/oauth2/auth",
    "https://appleid.apple.com/auth/authorize", "https://project-123.supabase.co/auth/v1/authorize",
    "about:blank",
  ]) assert.equal(navigationTarget(url), "internal", url);
});

test("lookalike hosts, credentials, query strings and ports cannot gain trust", () => {
  for (const url of [
    "https://www.sellonflock.com.evil.example/", "https://sellonflock.com.evil.example/",
    "https://evil.example/supabase.co", "https://evil.example/?next=accounts.google.com",
    "https://appleid.apple.com.evil.example/", "https://evil.supabase.co.evil.example/",
    "https://www.sellonflock.com:8443/", "http://www.sellonflock.com/",
    "https://www.sellonflock.com@evil.example/", "https://user:password@www.sellonflock.com/",
  ]) assert.notEqual(navigationTarget(url), "internal", url);
});

test("ordinary browser, mail and telephone links open externally", () => {
  for (const url of ["https://checkout.stripe.com/pay/test", "https://depop.com/", "mailto:help@sellonflock.com", "tel:+15551234567"])
    assert.equal(navigationTarget(url), "external", url);
});

test("executable schemes, local resources and malformed inputs are blocked", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hello", "file:///etc/passwd", "intent://example", "not a URL", "", null, {}, 123])
    assert.equal(navigationTarget(url), "blocked", String(url));
});

test("notification links resolve relative paths and preserve Flock destinations", () => {
  assert.equal(notificationTarget("/items/123?from=push#offers"), "https://www.sellonflock.com/items/123?from=push#offers");
  assert.equal(notificationTarget("https://sellonflock.com/inbox"), "https://sellonflock.com/inbox");
});

test("notifications cannot navigate to OAuth, external sites or executable schemes", () => {
  for (const url of ["//evil.example/", "https://www.sellonflock.com.evil.example/", "https://accounts.google.com/", "https://project.supabase.co/", "https://checkout.stripe.com/", "javascript:alert(1)", "data:text/html,hello", "file:///tmp/test", "http://sellonflock.com/", "https://sellonflock.com:8443/", "https://user@sellonflock.com/", "", null, {}])
    assert.equal(notificationTarget(url), null, String(url));
});
