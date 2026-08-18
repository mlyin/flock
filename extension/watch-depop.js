/**
 * Passive watcher for Depop's own unread badge.
 *
 * Depop has no public API and emits no webhook, so something has to notice that
 * an offer arrived. The expensive way is to keep opening a background tab and
 * reading the inbox. The cheap way is this: Depop renders "See 2 new offers"
 * into its header on *every* page, so while the seller has any Depop tab open
 * we can read that for free — no extra requests, no extra tabs, no traffic
 * pattern to notice.
 *
 * When the count changes, we ask the background script to sync. When it
 * doesn't, we do nothing at all. The 30-minute alarm in background.js stays as
 * the backstop for when Depop isn't open.
 *
 * Selector verified on the live signed-in site, 18 Aug 2026 — see SELECTORS.md.
 */

const BADGE = /see\s+(\d+)\s+new\s+(offers?|messages?)/i;

function readBadge() {
  // The badge is a leaf span in the header. Read text rather than a class name;
  // Depop's classes are hashed and change between deploys.
  for (const el of document.querySelectorAll("span, a, button")) {
    if (el.children.length > 0) continue;
    const match = (el.textContent || "").match(BADGE);
    if (match) return { count: Number(match[1]), kind: match[2].toLowerCase().replace(/s$/, "") };
  }
  return { count: 0, kind: null };
}

let last = null;

async function check() {
  const { count, kind } = readBadge();
  const key = `${kind ?? "none"}:${count}`;
  if (key === last) return;
  last = key;

  try {
    await chrome.runtime.sendMessage({ type: "depop-badge", count, kind });
  } catch {
    // The service worker may be asleep; the alarm will catch up.
  }
}

// Depop is a single-page app, so the header persists across navigations and a
// load listener alone would fire once. Watch for changes instead, throttled —
// the observer fires constantly on a grid of lazy-loading images.
let pending = false;
const observer = new MutationObserver(() => {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    check();
  }, 3000);
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });
check();
