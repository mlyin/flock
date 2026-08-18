# Moving to sellonflock.com

Threader → **Flock**, `getthreader.com` → `sellonflock.com`.

The order matters. DNS and Vercel first, Supabase second, extension last — the
extension is the only piece that breaks for *other people* if it goes early.

**Keep `getthreader.com` attached and working throughout.** Every extension
already installed has `https://getthreader.com` baked into its manifest and, for
anyone who has paired, stored in `chrome.storage.local`. Retiring the old domain
before those installs update logs them out with no error message that tells them
why.

---

## 1. Cloudflare — DNS

Dashboard → `sellonflock.com` → **DNS → Records**.

| Type | Name | Content | Proxy |
|---|---|---|---|
| CNAME | `@` | `cname.vercel-dns.com` | **DNS only (grey)** |
| CNAME | `www` | `cname.vercel-dns.com` | **DNS only (grey)** |

The apex CNAME works because Cloudflare flattens it — that's why no A record is
needed.

**The proxy must be grey, not orange.** An orange cloud puts Cloudflare's own
certificate in front of Vercel's, and the two fight: Vercel can't complete its
ACME challenge, so the domain sits on "Invalid Configuration", and once it
half-works you get redirect loops. This already cost time on `getthreader.com`.
Click the orange cloud until it goes grey.

If Cloudflare's SSL/TLS mode is **Flexible**, set it to **Full (strict)**.
Flexible talks HTTP to the origin and Vercel redirects HTTP→HTTPS, which is the
other way to build the same loop.

## 2. Vercel — domains

Project → **Settings → Domains**.

1. Add `sellonflock.com` and `www.sellonflock.com`.
2. Make `sellonflock.com` the **production** domain.
3. Redirect `www.sellonflock.com` → `sellonflock.com`.
4. **Leave `getthreader.com` attached**, redirecting to `sellonflock.com`.

Wait for both to read **Valid Configuration** before touching anything below.
Propagation is usually a minute or two on Cloudflare, and every later step
depends on the new domain actually serving.

Check it:

```bash
curl -sI https://sellonflock.com | head -3
```

## 3. Supabase — auth URLs

This is the step that silently breaks sign-in if it's skipped: Supabase refuses
any redirect it hasn't been told about, and the failure surfaces as a generic
"validation_failed" that looks like a Google problem.

Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://sellonflock.com`
- **Redirect URLs** — all four, keeping the old one:
  ```
  https://sellonflock.com/auth/callback
  https://www.sellonflock.com/auth/callback
  https://getthreader.com/auth/callback
  http://localhost:3737/auth/callback
  ```

**Google Cloud Console needs no change.** Google redirects to Supabase's own
callback (`https://kcudagjttmnklnveitgh.supabase.co/auth/v1/callback`), never to
our domain, so the OAuth client's authorised origins and redirect URIs are
already correct. The only place our domain appears is the Supabase config above.

## 4. Extension

Shipped in code, listed here so the order is clear:

- `manifest.json` matches **both** domains in `host_permissions` and in the
  `bridge.js` content-script matches.
- `background.js` defaults `apiBase` to `https://sellonflock.com`, and migrates
  anyone whose stored value is still `getthreader.com`. Without that migration a
  paired install keeps calling the old host forever, because the default only
  applies when nothing is stored.
- The `postMessage` identifiers between page and extension stay
  `threader-page` / `threader-extension`, and the marker attribute stays
  `data-threader-extension`. **This is deliberate.** Both sides have to agree on
  those strings, and they deploy independently — the site updates the instant
  Vercel builds, while an extension updates whenever its owner gets round to it.
  Renaming them would make every old install stop recognising the site, for no
  benefit anyone can see. They're invisible. Leave them.

After deploying, re-pack and re-upload so the download at `/install` is current:

```bash
node scripts/publish-extension.mjs
```

Then reload it at `chrome://extensions` — Chrome does not hot-reload unpacked
extensions.

## 5. Environment

Nothing in `.env.local` holds the public domain, so there is nothing to change
there. `NEXT_PUBLIC_SUPABASE_URL` is the Supabase project, not our site.

## Afterwards

- `getthreader.com` stays as a redirect indefinitely; it costs nothing and old
  links keep working.
- The Chrome Web Store listing (`extension/STORE.md`) references the old name
  throughout — update before submitting, not after.
- The extension icons are still the Threader "T with thread" mark. Redraw for
  Flock and regenerate with `node scripts/make-icons.mjs`.
