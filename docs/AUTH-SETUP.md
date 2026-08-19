# Auth — making the sign-in screen say Flock

The Google sign-in screen currently reads:

> **Sign in** — to continue to `kcudagjttmnklnveitgh.supabase.co`

That string is the **OAuth consent screen "App name"** — but Google only shows
it once your **brand has been verified**. Until then it falls back to the
domain of the OAuth callback, which is Supabase's.

So there are two independent levers, and they fix different halves:

| | What it changes | Cost | Wait |
|---|---|---|---|
| **A. Verify the Google brand** | "to continue to **Flock**" | free | minutes to 2–3 business days |
| **B. Supabase Custom Domain** | callback moves to `auth.sellonflock.com` | ~$10/mo **+ Pro $25/mo** | ~30 min |

**Do A first.** It is free and it is the one that actually puts the word
"Flock" on the screen. B only changes which domain appears as the fallback,
and it costs $35/month — do it when the polish is worth that, not before.

---

## A. Verify the Google brand (free)

Google reorganised this; the old "OAuth consent screen" page is now under
**Google Auth Platform**.

1. **console.cloud.google.com** → hamburger menu → **Google Auth platform** →
   **Branding**.
2. Set:
   - **App name**: `Flock`
   - **User support email**: an address you control
   - **Application home page**: `https://www.sellonflock.com`
   - **Privacy policy** and **Terms of service** URLs — required for
     verification, so these pages have to actually exist.
3. **Authorized domains**: add `sellonflock.com` only. Not `www.` and not
   `auth.` — Google wants the registrable domain and derives subdomains itself.
4. **Verify domain ownership in Google Search Console** for `sellonflock.com`,
   using an account that is Owner or Editor on this Cloud project. Brand
   verification will not pass without this, and a mismatch between the Search
   Console account and the Cloud project IAM is the usual reason it silently
   fails.
5. **Google Auth platform → Audience → Publish app.** Required: in Testing you
   are capped at 100 users and sessions expire in 7 days.
6. Back on **Branding**, click **Verify Branding**.

### Two things that waste an afternoon

- **Verify and Publish are separate buttons.** Clicking Verify Branding and
  walking away leaves the screen unchanged. You need both.
- **Any later edit to the app name, logo, homepage, privacy URL or authorized
  domains drops you back to Draft and requires re-verifying.** Get all of it
  right in one pass.

Google's automated review usually finishes in minutes; if it escalates to
manual it is 2–3 business days.

---

## B. Supabase Custom Domain — optional, $35/month

Only do this if you want the fallback domain to read `auth.sellonflock.com`.

**Not the same as Vanity Subdomains**, which are free-ish but only give you
`sellonflock.supabase.co` — still a supabase.co address, so it does not solve
this.

Requires the org on **Pro** ($25/mo) plus the **Custom Domain add-on** ($10 per
domain per month, billed hourly, **not covered by the Spend Cap**).

1. Dashboard → Project Settings → **Add-ons** → enable **Custom Domain**.
2. DNS at Cloudflare: `CNAME  auth  →  kcudagjttmnklnveitgh.supabase.co`
   (**grey cloud — DNS only**, proxying breaks certificate issuance), plus the
   TXT verification records Supabase gives you.
3. `supabase domains create --project-ref kcudagjttmnklnveitgh --custom-hostname auth.sellonflock.com`
4. **Add the new redirect URI to Google BEFORE activating** —
   `https://auth.sellonflock.com/auth/v1/callback`. Auth flips the instant you
   activate, and a callback Google does not recognise is a broken sign-in for
   everyone.
5. `supabase domains activate --project-ref kcudagjttmnklnveitgh`
6. Update `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` **and Vercel**, then
   redeploy.

### The trap worth knowing before you start

**Changing `NEXT_PUBLIC_SUPABASE_URL` signs out every logged-in user.**
supabase-js derives its session storage key from the URL's hostname, so the old
key is simply not found. Nobody loses data, but everyone signs in again — do it
at a quiet moment and expect the support question.

Only one custom domain per project, and it must be a subdomain:
`auth.sellonflock.com` is fine, `sellonflock.com` is not.

---

## Sign in with Apple

The app is ready: `components/SignIn.tsx` renders an Apple button when
`NEXT_PUBLIC_APPLE_SIGNIN=on`. It is gated deliberately — before the Apple side
exists the button can only return "Unsupported provider", which looks like a
feature and behaves like a bug.

Steps land in this file once verified against Apple's and Supabase's own docs.
Note two things that catch people, so they are worth knowing in advance:

- **Apple's client secret is a JWT that expires** (six months maximum). Sign-in
  breaks on that date with no warning unless it is rotated. Put a reminder in a
  calendar, not in a comment.
- **Apple sends the user's name only on the FIRST authorisation.** If it is not
  stored then, it is gone — re-authorising does not send it again.
