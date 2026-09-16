# Browser nodes — one always-on browser per seller

**Status, 16 Sep 2026: built, never run end to end.** The migrations apply
against a Supabase-shaped local Postgres, the tests pass, the extension
parses. No node has taken a real listing from draft to live. `lib/plan.ts`
carries the feature as `soon` until one has, and the bar for removing that
flag is a real seller's node publishing a real listing on the marketplace's
own word.

## What it is

The extension has lived in the seller's own Chrome, which is the safest place
for it and also the one that stops working the moment the lid closes. A node
is that same extension, unchanged, in a Chromium container on a host Flock
runs (`ops/nodes/`), holding the seller's marketplace **sessions** — signed in
by the seller, by hand, inside the node's own screen — and never their
passwords.

What the seller sees: Settings → Your Flock browser → Create. A URL and a
password. They open it, sign in to each marketplace once, close every tab.
From then on "Fill in my browser" on the inventory page or a garment's channel
board hands a fill to the node, and the dashboard's pending panel says what
came back.

## The rule that holds it together

**Filling a form is not publishing a listing.** Every status word in this
feature is chosen around that sentence.

| Status | Meaning |
|---|---|
| `queued` | the seller asked; no node has picked it up |
| `running` | a node opened the sell page and is filling it |
| `filled` | submit was pressed; the marketplace has not yet shown a listing |
| `needs_seller` | a person must press something: Facebook's second screen, Mercari's List, Grailed's typed designer, or any field the filler could not settle |
| `published` | the marketplace navigated to a live listing and the posted route recorded it |
| `failed` | the filler crashed or the form never rendered |
| `cancelled` | withdrawn |

`published` has exactly one path: the filled tab navigating to a listing URL,
caught by `watchForPublish` in `background.js`, posted to
`/api/ext/listing/[id]/posted`, which flips the listing to `live` and closes
the job. A node reporting "I pressed submit" gets `filled`, never more.
`needs_seller` is neither success nor failure, and the dashboard never uses
the word "live" for anything but `published` (`lib/nodes.test.ts` checks).

## How the pieces fit

```
Settings → Create          app/node-actions.ts createNode()
                             issueTokenWithId("Flock browser node")
                             POST $NODE_PROVISION_URL/provision  ──►  ops/nodes/provisioner.py
                                                                       new-node.sh: container +
                                                                       extension copy + node.json
                             nodes row: url, port, password (encrypted), token_id

Inventory → Fill in my browser   queueFills(): fill_jobs rows (one open per listing)

Node, every minute         GET /api/ext/jobs  → claim_fill_jobs() (SKIP LOCKED, listing still draft)
                           runFill(listingId, { autoSubmit })   ← the same function a laptop fill uses
                           POST /api/ext/fill-report            → evidence: what went in, what the form said
                           POST /api/ext/jobs/[id] {ok, filled, missing, blocked, publishedUrl}
                                                                → server runs classifyOutcome()

Marketplace navigates      watchForPublish → POST posted → listing live, job published
```

Decisions worth knowing:

- **A laptop is not a node.** `/api/ext/jobs` hands work only to a token that
  has a `nodes.token_id` behind it. A laptop's extension polls the same route
  and receives `[]`; nothing about laptops changed.
- **Zero-click pairing.** `new-node.sh` writes `node.json` (apiBase, token)
  into the node's copy of the extension. `adoptNodeConfig()` reads it on
  install or startup when no token is stored. The store build excludes the
  file (`scripts/pack-extension.mjs`); `.gitignore` refuses it.
- **The server classifies.** The node reports the filler's raw result;
  `lib/nodes.ts classifyOutcome()` decides the status, where the tests are.
  Per-job `autoSubmit` is decided server-side from `nodes.auto_submit` and is
  never true for Facebook or Mercari, whatever a storage flag on the node says.
- **One job per poll, one tab at a time.** Human-paced on purpose, and it keeps
  a run under Chrome's five-minute per-event cap for service workers.
- **The claim is atomic and the listing is checked twice.** `claim_fill_jobs`
  joins on `listings.status = 'draft'`; `runFill` re-checks the payload's
  status. A fill against a listing the seller already published by hand is the
  double-sale this product exists to prevent. `filled` counts as open in the
  unique index too: submit pressed and the marketplace silent is not a state
  to fill again from.
- **A node that dies mid-fill does not pin the listing.** A `running` job whose
  node has been silent for half an hour is reclaimed by the next poll (up to
  the attempt cap); after a quarter hour the seller can retry or cancel it
  from the dashboard. Nothing stays `running` forever.
- **Retries are the seller's, capped at three per job.** A failed or handed-off
  fill offers "Fill again"; the node never retries on its own. Dismissing a
  job and queueing the listing again starts a new job on purpose.
- **A job names its owner's listing.** A trigger in 0038 refuses a job whose
  listing belongs to someone else, so a guessed listing id cannot block
  another seller's queue through the unique index.
- **The session asks; the server and the node write.** 0038 grants a session
  INSERT on three columns and SELECT, nothing else. Retry and cancel run under
  the service role, scoped by user and checked against the same rules the
  dashboard used to offer the button.
- **A listing the node saw go live that Flock could not record** (the plan cap
  refused it, or Flock was unreachable) is handed to the seller as
  `needs_seller` with the URL, never shown as "waiting for the marketplace".
- **Liveness for free.** `verifyToken` stamps `extension_tokens.last_used_at`
  on every poll; the Settings card reads it through `nodes.token_id`.

## Security

- Flock holds **sessions, never passwords**. The seller types marketplace
  credentials into the node's Chromium; nothing in this repository sees them.
- `nodes.password_enc` (the KasmVNC login) is AES-256-GCM under
  `CHANNEL_TOKEN_KEY` via `lib/secrets.ts`, and revoked from the
  `authenticated` role (0037) the way `channel_accounts` is. Its owner can
  reveal it from the card, server-side.
- The pairing token is hashed as always; the plaintext lives in `node.json`
  inside the node's profile on the host disk, root-only.
- The node URL plus KasmVNC's basic auth is the gate in v1. A Flock-session-
  aware gate (Caddy `forward_auth`) is v2; it removes the second password but
  not the need for one on the container.
- The provisioner takes a bearer secret, validates every argument's shape
  before it reaches a shell, and listens on loopback only.

## Facebook and Mercari

`fill-facebook.js` stops at "Next" by design (a second screen follows);
`fill-mercari.js` ignores auto-submit by design (invisible reCAPTCHA v3 scores
a scripted click against the seller's real account). On a node both land in
`needs_seller`, and the seller finishes in the node's screen. That is not a
gap to close by pressing the button from a script.

Meta and Mercari also score the IP. A datacenter address is the strongest bot
signal there is, and a real Facebook account logging in from one commonly gets
a checkpoint. Two honest options: keep those two channels on the seller's own
laptop through the ordinary extension, or give the node a static residential
exit geo-matched to the seller (`nodes.proxy`; `new-node.sh` passes it as
`--proxy-server` with a bypass list for Flock and Supabase). Log in to Facebook
through that exit from day one, never first from the datacenter address.

## Plan and consent

Nodes ride on Hogget and Mutton: a container, RAM and an IP are a real cost of
goods (roughly $8–10 a seller a month on a shared host). The card carries a
consent paragraph: this browser runs on Flock's servers, holds your marketplace
logins, and marketplaces may treat listings from it differently. Per
`docs/CLOUD-BROWSER.md`, get a lawyer's read before a second paying seller is
on a node. That advice predates this code and stands.

## Running it

`ops/nodes/README.md` has the host in six steps. Then, from the code side:

```bash
npm run migrate            # 0037 nodes, 0038 fill_jobs
npm run audit:db           # the browser-nodes section: password unreadable, status
                           # unwritable, claim unexecutable, cross-tenant job refused
```

Deleting an account retires the node first (`app/account-actions.ts`): the
row would cascade, but a container holding someone's marketplace sessions is
a process on a host, and a cascade does not stop a process.

The proof that matters is the one nobody has done yet: queue one Depop draft
to your own node with auto-submit on and watch the dashboard row go
`queued → running → filled → published`, with the listing's URL on the channel
board. Until then this document describes a design, not a feature.
