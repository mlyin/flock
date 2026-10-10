const SITE = "https://www.sellonflock.com";
const FLOCK_HOSTS = new Set(["www.sellonflock.com", "sellonflock.com"]);
const AUTH_HOSTS = new Set(["accounts.google.com", "appleid.apple.com"]);

function parse(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, base);
    return url.username || url.password ? null : url;
  } catch {
    return null;
  }
}

function isFlock(url) {
  return url.protocol === "https:" && !url.port && FLOCK_HOSTS.has(url.hostname);
}

/** Keep site/auth navigation embedded; hand ordinary links to the browser. */
function navigationTarget(value) {
  if (value === "about:blank") return "internal";
  const url = parse(value);
  if (!url) return "blocked";
  if (isFlock(url)) return "internal";
  if (url.protocol === "https:" && !url.port && (
    AUTH_HOSTS.has(url.hostname) || /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)
  )) return "internal";
  if (["https:", "http:", "mailto:", "tel:"].includes(url.protocol)) return "external";
  return "blocked";
}

/** Notification payloads may navigate only to Flock, including relative paths. */
function notificationTarget(value) {
  const url = parse(value, SITE);
  return url && isFlock(url) ? url.href : null;
}

module.exports = { SITE, navigationTarget, notificationTarget };
