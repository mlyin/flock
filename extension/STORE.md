# Chrome Web Store listing

Paste-ready text for every field the publish checklist asks for.

Accuracy matters more than persuasion here: reviewers compare these answers to
what the code actually does, and an overclaim is what gets a submission rejected
or an extension pulled later.

---

## Store listing tab

**Category:** Shopping
*(not Developer Tools — this is for sellers, not developers)*

**Language:** English (United States)

**Detailed description**

```
Threader fills in marketplace sell forms using listings you've already prepared
in your Threader account, so you don't retype the same garment on every site.

How it works:

1. Prepare a listing in Threader — photos, title, description, price, size,
   condition.
2. Open the extension and pick the listing you want to post.
3. It opens that marketplace's sell page and fills in the fields it can.
4. You check everything, adjust anything it left blank, and press the
   marketplace's own submit button yourself.

The extension never submits a listing for you and never asks for your
marketplace password. It works inside the browser session you're already
signed in to, and a banner tells you exactly which fields it filled and which
it left for you.

Requires a Threader account (getthreader.com). Currently supports Depop,
Mercari, Vinted and Grailed sell forms.
```

---

## Privacy practices tab

**Single purpose description**

```
Fill in marketplace sell forms with listing data from the user's own Threader
account, so the same item doesn't have to be retyped on every marketplace.
```

**Justification — host permissions**

```
getthreader.com — to fetch the user's own listing data (title, description,
price, size, condition) after they pair the extension with their account.

depop.com, mercari.com, vinted.com, grailed.com — to fill the sell form on the
marketplace the user has chosen. The extension only touches these pages when
the user clicks a specific "Fill on ..." button, and only fills form fields. It
does not submit forms, read the user's account data, or act on any other page.

*.supabase.co — the user's own listing photos are stored there and fetched via
short-lived signed URLs so they can be attached to the sell form.

localhost — development only.
```

**Justification — scripting**

```
Used to inject the form-filling script into the marketplace tab the user
explicitly asked to fill. All injected scripts are bundled in the extension
package; nothing is fetched or evaluated at runtime. Injection is triggered
only by a direct user click, never automatically or in the background.
```

**Justification — storage**

```
Stores two things locally with chrome.storage.local: the pairing token that
authenticates the extension to the user's own Threader account, and two user
preferences (whether to fill in a background window, and whether to auto-fill
the final step). No browsing history, page content or personal data is stored.
```

**Remote code**

Select **"No, I am not using remote code."** That is accurate — every script that
executes ships inside the package. If a justification box appears anyway:

```
No remote code is executed. All scripts are bundled in the extension package.
The extension fetches JSON listing data and image files over HTTPS, but these
are data only — never scripts, and nothing is passed to eval() or injected as
executable code.
```

**Data usage certification** — tick all three:

- Not being sold to third parties
- Not being used or transferred for purposes unrelated to the item's single purpose
- Not being used or transferred to determine creditworthiness or for lending

All three are true. The extension moves the user's own listing data from their
own account into a form on their own screen. Nothing is collected, retained, or
transmitted anywhere else.

---

## Settings tab

**Contact email** — must be set *and verified* before publishing. Chrome sends a
verification link; the item can't be submitted until you click it.

---

## Graphic assets

| Asset | File | Size |
|---|---|---|
| Store icon | `store-icon-128.png` | 128 × 128 |
| Screenshot | `store-screenshot-1280x800.png` | 1280 × 800 |

Regenerate either with `node scripts/make-icons.mjs` or
`node scripts/make-screenshot.mjs`.

---

## Likely review questions

Extensions that fill forms on third-party sites get looked at closely. Two
things are worth stating plainly if a reviewer asks:

- **It does not automate submission.** The user presses the marketplace's own
  button. The extension fills fields and stops.
- **It handles no marketplace credentials.** It uses the session the user is
  already signed in to; no marketplace password ever reaches Threader.
