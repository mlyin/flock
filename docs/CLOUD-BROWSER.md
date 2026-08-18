# Cloud browser per user — how to actually build it

The extension is the right architecture for one engineer and no users, and the wrong one
the moment a seller expects their shop to keep working with the laptop shut. This is the
migration, in the order I'd do it.

The single most important thing to know before starting: **the fillers already port.**
`fill-depop.js`, `fill-vinted.js` and `fill-grailed.js` are pure DOM functions that take a
listing payload and touch nothing Chrome-extension-specific except `chrome.runtime` at the
very bottom. In Playwright they become `page.evaluate(fillerSource, payload)`. That is the
whole rewrite. Keep them that way.

---

## 1. Pick the runtime

| Option | What you get | Cost shape | Verdict |
|---|---|---|---|
| **Browserbase** | Managed headful Chrome, persistent contexts, embeddable live view, residential proxies built in | ~$0.10–0.20/browser-hour + proxy GB | **Start here.** The live view and context persistence are the two things you'd otherwise build yourself |
| **Steel.dev** | Same shape, open-source core, can self-host later | Similar hosted; free self-hosted | Best if you want an exit from the vendor |
| **Kernel** | Newer, agent-focused, cheap | Cheapest | Less proven for long-lived authenticated sessions |
| **Self-host** Playwright + Xvfb on Fly.io | Total control | ~$5–15/mo per always-on machine | Only once volume justifies it — you'd be rebuilding live view and proxying |

Recommendation: **Browserbase for the spike**, keep the driver code vendor-neutral behind a
small interface so switching is a file, not a rewrite.

---

## 2. The login problem, and the good news

The objection I raised earlier was credential custody: moving server-side means holding
marketplace credentials. **The live-view flow avoids most of that.**

1. Threader creates a persistent browser context for the seller.
2. The seller is shown that browser **embedded in an iframe** (Browserbase and Steel both
   expose a live-view URL).
3. They log into Depop *inside it*, typing into the remote browser. 2FA, captchas and
   Apple/Google SSO all work, because a real person is doing it.
4. The session cookies live in the persistent context, keyed to that seller.

So you hold **a session, not a password**. That's a materially smaller blast radius, and
it's the same thing every "connect your account" product does. It does not remove the need
to encrypt what you store, and a stolen session is still account access — but nobody's
password passes through Threader, and there's no place for one to leak from.

What you must still do:
- Encrypt context ids and any exported cookies at rest. `channel_accounts` already stores
  tokens **in plaintext** — fix that first, before a second person ever connects.
- Re-auth flow for when a session expires, which it will. Surface it as "reconnect Depop"
  rather than a silent sync failure.

---

## 3. Shape of the system

```
Next.js (Vercel)                    Worker (Fly/Railway/Render)
─────────────────                   ────────────────────────────
POST /api/jobs  ──► job row  ◄──── poll / LISTEN
   list, sync, delist                      │
                                           ▼
                                  Browserbase session
                                  (persistent context per user+channel)
                                           │
                                           ▼
                                  page.evaluate(fill-depop.js, payload)
                                           │
                                           ▼
                                  POST back: url, status, offers, messages
```

Vercel functions time out and are the wrong home for a job that drives a browser for 40
seconds. Put the worker somewhere with a real process: **Fly.io** or **Railway**, one small
machine to start, scaled by queue depth later.

Queue: a `jobs` table plus Postgres `LISTEN/NOTIFY` is enough for a long time and adds no
infrastructure. Reach for Inngest or QStash only when retries and fan-out get fiddly.

---

## 4. The staged plan

**Stage 0 — spike (half a day).** One script, no product changes. Create a Browserbase
persistent context, open the live view, log into Depop by hand, close it. Reopen the
context an hour later and confirm you're still signed in. **If session persistence doesn't
survive, nothing else matters** — find that out first.

**Stage 1 — read-only sync.** Move the Depop shop reader and message reader into the
worker. Lower risk than posting, works with the laptop shut, and it's what unlocks
auto-delist and the offers queue. The extension keeps doing the listing.

**Stage 2 — one channel posting.** Depop only. Same filler, driven by Playwright. Run it
alongside the extension and compare outcomes on real items before trusting it.

**Stage 3 — parallel fan-out.** `Promise.all` across channels in the worker. This is the
point at which "one button lists everywhere" becomes literally true, because each channel
is its own page in its own context.

**Stage 4 — retire the extension**, or keep it as the zero-setup option for sellers who'd
rather not hand over a session. Both can coexist; they share the fillers.

---

## 5. What will bite

- **Mercari already refuses.** It serves an automated tab an empty shell — zero inputs, in
  a fresh tab, twice. A datacenter IP makes that *worse*, not better. Mercari needs
  residential proxying and stealth, and may still be extension-only.
- **Residential proxies are the real cost.** Datacenter IPs are the strongest bot signal
  there is. Budget per-GB, and only proxy the channels that need it.
- **Cost per seller.** A warm browser is cents per hour, but listings are bursty. Hibernate
  contexts between jobs; never leave one running idle.
- **This is a clearer ToS violation than the extension.** A seller automating their own
  browser is a grey area they take on. Threader driving their account from its own
  infrastructure moves that liability onto Threader. Worth a lawyer's eye before it's the
  default for paying users, not after.
- **eBay and Etsy have real APIs.** Neither should ever touch a browser, cloud or local.
  Every channel moved onto an API is one fewer that needs any of this.

---

## 6. Concretely, this week

```bash
npm i playwright-core @browserbasehq/sdk
```

```
BROWSERBASE_API_KEY=...
BROWSERBASE_PROJECT_ID=...
```

Write `lib/cloud-browser.ts` with three functions and nothing else:
`createContext(userId, channel)`, `liveViewUrl(contextId)`, `withPage(contextId, fn)`.
Then do Stage 0 against it. Don't build the worker, the queue or the UI until a Depop
session has demonstrably survived being closed and reopened.
