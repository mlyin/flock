# Publishing to the Chrome Web Store

`npm run pack:ext` builds `dist/threader-extension-<version>.zip`. That's the file you
upload. It strips the localhost host permission — reviewers treat unnecessary permissions
as something to ask about, and users have no dev server to reach.

## Before you start

- **$5 one-time developer registration**, at
  [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole).
  Paid once per Google account, not per extension.
- **Privacy policy URL**: `https://getthreader.com/privacy` — already live and reachable
  without signing in. That last part matters: a reviewer who hits a login wall rejects.
- **Screenshots**: 1280×800 or 640×400 PNG, at least one, up to five. Take them of the
  extension popup with real listings and of a filled Depop form with the banner showing.
  Screenshots are the single biggest driver of installs — worth doing properly.

## Listing copy

**Name**: Threader — cross-list to Depop and Mercari

**Summary** (132 characters max):

> Fill your Depop and Mercari listings from one place. You review and publish every listing yourself.

**Category**: Workflow & Planning

**Description**:

> Threader keeps your secondhand clothing inventory in one place and fills the sell forms
> on Depop and Mercari so you don't retype the same garment twice.
>
> How it works:
> • Catalogue a garment once in Threader — photos, size, condition, flaws, price
> • Open the extension and pick which listing to post
> • It opens the marketplace's own sell page and fills what it can
> • You set the dropdowns, check everything, and hit publish yourself
>
> Threader never sees your Depop or Mercari password. It works inside the session you're
> already signed in to, and it never submits a listing for you — the final click is always
> yours.
>
> Requires a free Threader account at getthreader.com.

## Single purpose

The console asks you to state one purpose. Don't hedge here; a vague answer invites review.

> Fills the seller's own Depop and Mercari listing forms with garment details they
> previously entered into their Threader account.

## Permission justifications

Paste these into the matching fields. Each one names the specific code path.

| Permission | Justification |
|---|---|
| `storage` | Stores the pairing code that links the extension to the user's Threader account, and the Threader address. Nothing else is stored locally. |
| `scripting` | Injects the form-filling script into the Depop or Mercari sell page, only when the user clicks "Fill" for a specific listing. |
| `https://getthreader.com/*` | Fetches the user's own drafted listings from their Threader account, authenticated with the pairing code. |
| `https://*.supabase.co/*` | Downloads the user's own product photos to attach to the listing. Photos are served from Supabase storage via short-lived signed URLs. |
| `https://www.depop.com/*` | Fills the Depop sell form. |
| `https://www.mercari.com/*` | Fills the Mercari sell form. |

**Remote code**: No. Every script is in the package; nothing is fetched and executed.

## Data disclosure

Tick **Personally identifiable information** — the listings fetched are tied to a user
account. Then the three certifications:

- Not sold to third parties ✓
- Used only for the single purpose above ✓
- Not used for creditworthiness or lending ✓

## Review

Expect a few days, occasionally longer. Extensions with host permissions on third-party
sites get looked at more closely.

If it's rejected, the most likely reasons and what to do:

- **"Purpose unclear"** — the description didn't make it obvious the *user* clicks publish.
  Lead with that sentence.
- **"Unnecessary permissions"** — a permission in the manifest that no code path uses.
  Grep for the API before adding anything.
- **Marketplace automation concerns** — respond that the extension fills forms in the
  user's own authenticated session, requires explicit per-listing action, and never
  submits. Vendoo, List Perfectly, and Crosslist all ship on the store on that basis.

## Releasing an update

1. Bump `version` in `extension/manifest.json` — the store rejects a re-upload of the
   same version
2. `npm run pack:ext`
3. Upload the new zip and submit

Updates roll out to existing users automatically over a few hours.
