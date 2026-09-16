# The mobile API — `/api/m`

The contract between the native app (`mobile/`) and Flock's server, as of
16 Sep 2026. Every route here calls the function the web app calls and
returns what it returned. There is no second implementation of any rule:
the plan cap, "filling is not publishing", the price push onto live
listings, the refusal to delete a garment that is still live — all of it
runs once, in `app/actions.ts`, `app/node-actions.ts` and `lib/`, for both
clients. `lib/mobile-auth.ts` is the wrapper; `lib/bearer-context.ts` is how
the seller's credential reaches code that was written for a cookie.

**Status: implemented, typechecked, unit-tested, built. Not yet exercised
end to end from a phone** — that needs a real sign-in, and every claim below
about what the app sees should be read as "what the server sends", verified
by reading the route, not "what the app has displayed".

## Authentication

Send the Supabase session's access token on every request:

```
Authorization: Bearer <session.access_token>
```

That is the JWT supabase-js hands the app at sign-in. The server verifies
it with Supabase Auth on every call (`auth.getUser`, a network round trip,
not a local decode), then runs the route as that user under row-level
security — the same context the web gets from its cookie. Tokens expire
after an hour; supabase-js refreshes them on its own. On a 401, refresh and
retry once, then send the seller back to sign-in.

Not accepted: the extension's pairing code, the publishable key, anything
that is not three base64url segments. Those are refused before Supabase
sees them.

### Sign-in on the phone

Google refuses OAuth inside a WebView, so the app signs in through the
system browser (`expo-web-browser` / `ASWebAuthenticationSession`) with
`signInWithOAuth({ provider: "google", options: { redirectTo: "flock://auth", skipBrowserRedirect: true } })`
and finishes with `exchangeCodeForSession` on the deep link. That is the
standard Supabase-on-Expo shape; it has not been run here.

## Response shape

JSON, `cache-control: no-store`.

| Status | Body | Meaning |
|---|---|---|
| 200 | route-specific, `ok: true` where the web function returns one | done |
| 400 | `{ ok: false, error }` | the request is the wrong shape; a bug in the app |
| 401 | `{ error }` | no token, or one Supabase would not vouch for |
| 422 | `{ ok: false, error }` | the rule said no. `error` is the sentence the web shows the seller — show it verbatim |
| 500 | `{ error }` | a server function threw. Report it; do not retry in a loop |

A 422 is not a failure of the app. "You have 15 listings live, which is
the limit on Lamb" is the product working.

## What the app does directly against Supabase

With its own session, under RLS, exactly as the web's browser client does:

- **Read** `items`, `listings`, `photos`, `fill_jobs`, `profiles`, and the
  granted columns of `nodes`. Its own rows only; the database enforces it.
- **Upload photos** to the `photos` Storage bucket at
  `{user_id}/inbox/{uuid}.jpg`. The bucket policy checks the first path
  segment against `auth.uid()`. Then register each one (below).
- **Show photos** through signed URLs (`storage.from("photos").createSignedUrl`).
- **Live updates** through Realtime on `fill_jobs` and `listings`, if wanted;
  polling `GET /api/m/fills` every 30 s is fine too.

Everything that carries a rule goes through a route. In particular the app
must **never** write these directly, even though RLS would let a seller
write their own row:

| Direct write | What it skips | Use instead |
|---|---|---|
| insert `items` | SKU, photo claiming, drafting on every channel | `POST /api/m/identify` |
| update `items` | the price push onto draft and live listings; `review_state` | `PATCH /api/m/items/{id}` |
| delete `items` | "still live on Depop" refusal; Storage cleanup | `DELETE /api/m/items/{id}` |
| update `listings.status` | the plan cap; closing the node's open job; the sale, its fees, delist tasks | `POST /api/m/listings/{id}/status` |
| insert `fill_jobs` | the plan cap; draft-only and fillable-channel checks | `POST /api/m/fills` |

The database still refuses the worst of it (ownership triggers, the open-job
unique index, the draft-only join at claim time), but the plan cap lives in
code, and the cap is the one that costs money.

## Routes

### `GET /api/m/me`

Who am I, what am I on, do I have a browser. First call after sign-in; the
account screen polls it.

```json
{
  "user": { "id": "uuid", "email": "m@example.com" },
  "plan": {
    "id": "lamb", "label": "Lamb", "monthly": 0,
    "activeListings": 15, "active": 3, "remaining": 12, "atCap": false,
    "beta": false
  },
  "node": {
    "status": "ready",
    "url": "https://nodes.sellonflock.com/n/abc123/",
    "autoSubmit": false,
    "tokenRevoked": false,
    "liveness": { "state": "fresh", "minutesAgo": 1, "detail": "Polled a minute ago." }
  }
}
```

- `plan.activeListings` and `plan.remaining` are `null` on a plan with no
  limit. `plan` is `null` only if the profile row is missing.
- `node` is `null` until the seller creates one (Settings on the web; there
  is no create route yet — see "Not here yet"). `node.status` is one of
  `provisioning | ready | paused | error | retired`; `liveness.state` is
  `never | fresh | late | silent`. A node that is `ready` but `silent` is
  not working, and the app should say so in those words.
- `node.url` is the seller's own browser screen. Open it in the system
  browser (it has its own login) when a fill needs their hand.

### `POST /api/m/photos`

Register a photo the app already uploaded.

Request: `{ "storagePath": "uuid/inbox/uuid.jpg", "bytes": 812331 }`
Response: `{ "ok": true, "photoId": "uuid" }`

400 `{ ok: false, error }` if the path is not under the caller's own
prefix, or is blank. `bytes` is for the storage meter; send the real size.

### `POST /api/m/identify`

Photos in, one garment out — with listing copy drafted for every channel.
The same call as the web's Identify button.

Request: `{ "photoIds": ["uuid", ...], "mode": "manual" }`

- `photoIds`: one to twelve ids from `/api/m/photos`, all still unclaimed
  (a photo already on a garment is skipped by the server). A list with one
  malformed id is refused whole, 400.
- `mode`: omit for the model read. `"manual"` files the photos against a
  blank garment with no model call — for a piece with no tag, or a seller
  who does not want to pay for the read.

Response 200: `{ "ok": true, "itemId": "uuid", "sku": "FL-0042", "questions": ["What size is the tag?"] }`

`questions` is what the model could not settle; show them on the review
screen. 422 `{ ok: false, error }` when the model refused or no photo was
free. **Slow**: several seconds for two photos. Do not time out at ten.

### `PATCH /api/m/items/{id}`

The review screen's save. Send the fields that changed; a blank string
clears; a key left out is left alone. Marks the garment reviewed.

Request, any subset of:

```json
{
  "sku": "FL-0042", "title": "Margiela knit", "brand": "Maison Margiela",
  "category": "Knitwear", "size": "M", "color": "Grey", "material": "Wool",
  "style_code": "S50HA1110", "condition": "good",
  "cost_basis": 40, "list_price": 180, "floor_price": 140, "target_profit": 100,
  "package_size": "small", "source": "Estate sale",
  "flaws": ["pilling at cuffs", "small hole, left hem"], "notes": "..."
}
```

- Money is a number or `null`; `0` clears `list_price`, `floor_price` and
  `target_profit` (zero means "no target"); `cost_basis` `0` is stored.
- `flaws` is a list, or one string with a line per flaw.
- `list_price` is pushed onto every **draft and live** listing of the
  garment. Sold and ended listings keep their price.
- `title` blank saves as "Untitled", `category` as "Other", `condition` as
  "good" — the web's defaults.
- Unknown keys are dropped, not refused; a body with no known key is 400.

Response: `{ "ok": true }`; 422 `{ ok: false, error }` for a garment that is
not the caller's (RLS makes it "Couldn't find that garment.").

### `DELETE /api/m/items/{id}`

Refuses a garment with a live listing (`422`, "Still live on depop. …")
because deleting here would not take the listing down. Otherwise removes
the photos from Storage and the row. Response `{ "ok": true }`.

### `POST /api/m/items/{id}/draft`

Write listing copy for the garment on every channel, then return the
drafts. Never touches a listing that is already live (copy only, on those).

Request: `{ "mode": "basic" }` (default; instant, no key) or
`{ "mode": "ai" }` (the web's "Rewrite with AI"; seconds).

Response:

```json
{
  "ok": true, "mode": "basic",
  "listings": [
    { "id": "uuid", "channel": "depop", "status": "draft", "title": "...", "description": "...",
      "price": 180, "shipping_price": 0, "url": null, "drafted_by": "basic", "drafted_at": "2026-09-16T05:00:00Z" }
  ]
}
```

`channel` is one of `ebay poshmark depop mercari vinted grailed therealreal facebook stockx vestiaire`. 422 `{ ok: false, error }` if the garment is not the caller's or the model failed.

### `POST /api/m/listings/{id}/status`

The seller's word about a listing. **Not** the node's: a fill job's status
never justifies this call (see `/api/m/fills`).

| Body | Does | Gate |
|---|---|---|
| `{ "status": "live", "url": "https://…" }` | marks it live by hand, records the link if given | plan cap (422 with the cap sentence); closes any open fill job for it |
| `{ "status": "draft" }` | back to draft | refused if a sale is recorded against it |
| `{ "status": "sold", "sale": { "soldPrice": 160, "shippingCollected": 8, "shippingCost": 6, "soldAt": "2026-09-16T04:00:00Z" } }` | records the sale, computes the channel's fees from `lib/fees.ts`, opens a delist task for every sibling still live | `soldPrice` > 0 required |
| `{ "url": "https://…" }` | saves the link only, status unchanged | must start with http(s) |

Responses: `{ "ok": true, "status": "live", "url": "…" }`,
`{ "ok": true, "status": "draft" }`,
`{ "ok": true, "status": "sold", "toDelist": 2 }` (siblings the seller now
has to take down — show the delist queue), `{ "ok": true, "url": "…" }`.

### `GET /api/m/fills`

What the seller's browser node is doing and what it is waiting on. The
dashboard's pending panel as JSON.

```json
{
  "jobs": [
    {
      "id": "uuid", "status": "needs_seller", "channel": "facebook",
      "label": "Needs you — the form is filled; press Next in your browser.",
      "attempts": 1, "autoSubmit": false,
      "requestedAt": "…", "claimedAt": "…", "finishedAt": "…",
      "listingId": "uuid", "listingTitle": "Margiela knit",
      "item": { "id": "uuid", "sku": "FL-0042", "title": "Margiela knit" },
      "filled": ["title", "price", "description"], "missing": ["category"], "blocked": [],
      "errors": [], "error": null,
      "canRetry": false, "canCancel": true,
      "filledMinutesAgo": null, "stale": false
    }
  ]
}
```

`status` is one of `queued running filled needs_seller published failed cancelled`.
Read them as the server means them:

- `filled` — the node pressed submit on an auto-submit channel and the
  marketplace has not answered yet. **Not live.** If it stays `filled`
  (`stale: true` after fifteen minutes), the seller looks in their browser.
- `needs_seller` — a form a person has to finish, in the node's screen
  (`node.url` from `/api/m/me`). Facebook and Mercari always end here; so
  does any field the filler could not settle.
- `published` — the marketplace showed a live listing and the server
  recorded it. This is the only status that means live, and it is set by the
  posted route, never by the node's report.
- `failed` — `error` says why; `canRetry` says whether asking again is
  allowed (three attempts).

The app shows `label` as the status text. It does not invent its own.
Retry and cancel have no mobile route yet (see below).

### `POST /api/m/fills`

Hand fills to the node. Same function as the inventory page's "Fill in my
browser".

Request: `{ "listingIds": ["uuid", …] }` or `{ "itemIds": ["uuid", …] }`
(every fillable draft of those garments). Up to 100.

Response: `{ "ok": true, "queued": 3, "skipped": 1 }` — `skipped` is
listings that already had an open job, were not drafts, or are on a channel
without a filler. 422 `{ ok: false, queued: 0, skipped: 0, error }` when
there is no usable node ("Create your browser in Settings first.") or the
plan has no room for the garments involved.

Facebook and Mercari jobs always come back `needs_seller`. Depop, Vinted and
Grailed publish only if the node's auto-submit is on. **Queuing a fill is
not listing; the app must not show it as such.**

## Not here yet

- Creating, pausing and opening the node; revealing its password. Settings
  on the web does this; the app can deep-link to `/settings`.
- Retrying or cancelling a fill job.
- Adopting an external listing, recording an offer, the delist queue's
  done/skipped, comps and market pricing, addresses, billing. All exist as
  web server actions and can be wrapped the same way in an afternoon each.
- Push notifications for `needs_seller`.

## Adding a route

1. Find the web's server action for the thing. If there is none, the
   feature does not exist yet; build it for the web first.
2. Wrap it in `withMobileSession`; validate the body's *shape* only.
3. Return the action's own outcome; map `ok: false` to 422.
4. Add it to this file, with the gate it carries and the sentence a 422
   shows.

Do not read the JWT's claims yourself, do not use `supabaseAdmin()` unless
the web route does, and do not add a rule here that the web does not have.
