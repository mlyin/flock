# Auth — making the sign-in screen say Flock

The Google sign-in screen currently reads:

> **Sign in** — to continue to `kcudagjttmnklnveitgh.supabase.co`

That string is the **OAuth consent screen "App name"** — but Google only shows
it once your **brand has been verified**. Google's own wording: *"The app name
will be displayed on the OAuth consent screen only if your app has been
verified."* Until then it falls back to the domain of the OAuth callback, which
is Supabase's.

So there are two independent levers, and they fix different halves:

| | What it changes | Cost | Wait |
|---|---|---|---|
| **A. Verify the Google brand** | "to continue to **Flock**" | free | minutes to 2–3 business days |
| **B. Supabase Custom Domain** | callback moves to `auth.sellonflock.com` | ~$10/mo **+ Pro $25/mo** | ~30 min |

**Try A first.** It is free and it is the one that actually puts the word
"Flock" on the screen. B only changes which domain appears as the fallback.

---

## A. Verify the Google brand (free)

Google reorganised this; the old "APIs & Services → OAuth consent screen" page
is now **Google Auth platform**.

1. **console.cloud.google.com** → hamburger menu → **Google Auth platform** →
   **Branding**. (Direct: `console.cloud.google.com/auth/branding`.) Check the
   project selector first.
2. Set:
   - **App name**: `Flock`
   - **User support email**: must be your own address or a Google Group you
     manage — Google rejects anything else
   - **App logo**: square, **120×120**, under 1MB, JPG/PNG/BMP
   - **Application home page**: `https://www.sellonflock.com`
   - **Privacy policy** and **Terms of service** URLs — required, so those
     pages have to actually exist
3. **Authorized domains**: add `sellonflock.com` only. Not `www.`, not `auth.`
   — Google derives subdomains itself.
4. **Verify domain ownership in Google Search Console** for `sellonflock.com`,
   using an account that is **Owner or Editor on this Cloud project**. A
   mismatch between the Search Console account and the Cloud project IAM is the
   single most common reason verification fails.
5. **Google Auth platform → Audience → Publish app.** Required: brand
   verification only applies to apps that are External *and* Published, and in
   Testing you are capped at 100 users with 7-day sessions.
6. Back on **Branding** → **Verify Branding**.
7. When the status reads **Ready to publish**, click the separate **Publish
   branding** button. Verification alone does not change the live screen.

Flock requests only `openid`, `email` and `profile` — all non-sensitive — so
this is the *brand* verification track only. No demo video, no security
assessment, no CASA.

### Three things that waste an afternoon

- **There are THREE buttons, not one**: Publish app (under Audience), Verify
  Branding, then Publish branding. Doing the first two and walking away leaves
  the sign-in screen exactly as it was.
- **A compliant verification result is valid for only 7 days.** Miss that
  window and it flips to "Need to re-verify" and you start again.
- **Any later edit to the app name, logo, homepage, privacy URL or authorized
  domains drops you back to Draft** and requires re-verifying. Get it all right
  in one pass — including any extra OAuth scopes you might want later.

Automated review usually finishes in minutes; manual escalation is 2–3 business
days. Test in a fresh incognito window with all Google accounts signed out,
and re-test rather than assuming failure — the screen is cached.

### The one unresolved thing, stated plainly

Google's rule for Authorized domains is *"All domains used in your project ...
must be pre-registered here."* Read literally that includes **supabase.co**
while the callback lives there — and you cannot verify ownership of a domain
you do not own.

Whether verification passes anyway with a supabase.co callback could not be
confirmed from Google's documentation. If it fails on that, doing **B first**
is the fix, and that is the only scenario where the $35/month is genuinely
required rather than polish. Trying A alone costs nothing to find out.

---

## B. Supabase Custom Domain — optional, $35/month

**Not the same as Vanity Subdomains**, which are cheaper but only give you
`sellonflock.supabase.co` — still a supabase.co address, so it does not solve
this.

Requires the org on **Pro** ($25/mo) plus the **Custom Domain add-on** ($10 per
domain per month, billed hourly, and **not covered by the Spend Cap**).

1. Dashboard → Project Settings → **Add-ons** → enable **Custom Domain**.
2. DNS at Cloudflare: `CNAME  auth  →  kcudagjttmnklnveitgh.supabase.co`
   — **grey cloud, DNS only**; proxying breaks certificate issuance — plus the
   TXT verification records Supabase gives you. Enter only the subdomain part
   of each TXT name; Cloudflare appends the zone itself.
3. `supabase domains create --project-ref kcudagjttmnklnveitgh --custom-hostname auth.sellonflock.com`
4. **Add the new redirect URI to Google BEFORE activating** —
   `https://auth.sellonflock.com/auth/v1/callback`. Keep the old one listed
   during cutover. Auth flips the instant you activate, and a callback Google
   does not recognise is a broken sign-in for everyone.
5. `supabase domains activate --project-ref kcudagjttmnklnveitgh`
6. Update `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` **and Vercel**, redeploy.
7. If Apple sign-in is live, update the Services ID too — see below.

Only one custom domain per project, and it must be a subdomain:
`auth.sellonflock.com` is fine, `sellonflock.com` is not.

### The trap worth knowing before you start

**Changing `NEXT_PUBLIC_SUPABASE_URL` signs out every logged-in user.**
supabase-js derives its session storage key from the URL's hostname, so the old
key is simply not found. Nobody loses data, but everyone signs in again — do it
at a quiet moment.

---

## Sign in with Apple

The app is ready: `components/SignIn.tsx` renders an Apple button when
`NEXT_PUBLIC_APPLE_SIGNIN=on`. Gated deliberately — before the Apple side
exists the button can only return "Unsupported provider", which looks like a
feature and behaves like a bug.

The $99/year Developer Program membership covers it; Sign in with Apple costs
nothing on top, and nothing on the Supabase side.

### On developer.apple.com

1. **Team ID** — 10 characters, top-right of the Developer Console, also on
   Membership details.
2. **App ID** — Certificates, Identifiers & Profiles → Identifiers → (+) →
   *App IDs* → *App*. Reverse-DNS bundle id, e.g. `com.sellonflock.app`. Tick
   **Sign in with Apple**.
3. **Services ID** — Identifiers → (+) → *Services IDs*. This is what Supabase
   calls **Client ID**. Make it distinct, e.g. `com.sellonflock.web`.
4. Open the Services ID → tick **Sign in with Apple** → **Configure**:
   - Primary App ID: the one from step 2
   - Domains: `kcudagjttmnklnveitgh.supabase.co`
   - **Return URL**: `https://kcudagjttmnklnveitgh.supabase.co/auth/v1/callback`
5. **Key** — Keys → (+), name it, tick **Sign in with Apple**, Configure →
   pick the primary App ID → Register. **Download the `.p8` once**; Apple never
   shows it again. The **Key ID** is the 10 characters in the filename
   `AuthKey_XXXXXXXXXX.p8`.

### Generating the client secret

Supabase's docs page has a **generator that runs entirely in your browser**:
`supabase.com/docs/guides/auth/social-login/auth-apple`. Feed it the Team ID,
Services ID, Key ID and the `.p8`. **It does not work in Safari** — use Chrome.

### In Supabase

Authentication → Sign In / Providers → **Apple** → enable.
**Client IDs** = your Services ID. **Secret Key (for OAuth)** = the generated
JWT. Save.

Then Authentication → URL Configuration: Site URL set to the production origin,
with `https://www.sellonflock.com/auth/callback` and
`http://localhost:3737/auth/callback` in the Redirect URLs allow list.

Finally set `NEXT_PUBLIC_APPLE_SIGNIN=on` in `.env.local` and in Vercel.

### The five things that actually bite

- **The client secret is a JWT that EXPIRES — six months maximum, and nothing
  warns you.** Not Apple, not Supabase. Sign-in just starts failing with
  `invalid_client`. Put a calendar reminder at five months to regenerate it
  from the same `.p8`; you do not need a new key.
- **The web flow NEVER receives the user's name.** Not "only the first time" —
  never, on the OAuth/web path. The identity token carries the email every time
  and no name at all, so Apple users show as their email in the nav until an
  onboarding step asks them.
- **Private relay emails.** Many users pick *Hide My Email* and you get
  `something@privaterelay.appleid.com`. That is a real, permanent address for
  that user, but it will never match their Google address — so someone who
  signs in with Google one day and Apple the next becomes two accounts unless
  you link on Apple's `sub`.
- **No domain-association file is required** for the Services ID web config.
  Just as well: you could not host a file on `kcudagjttmnklnveitgh.supabase.co`
  anyway.
- **A Supabase custom domain later will BREAK Apple sign-in** until the Services
  ID's Domains and Return URL are updated to match. Exact-match, both fields.
  A second reason to decide about section B before doing much else.

Two smaller ones: Apple rejects `localhost` and IP addresses as Return URLs
(fine here — Apple redirects to Supabase, not to your machine), and individual
developer accounts are capped at 10 website URLs per Services ID.

Worth knowing since it is usually misremembered: Apple does **not** require you
to offer other sign-in methods. App Store Review Guideline 4.8 runs the other
way — apps offering Google or Facebook login must also offer Apple. It applies
to App Store apps, not to a website.
