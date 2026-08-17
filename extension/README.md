# Threader extension

Fills Depop and Mercari sell forms from your Threader inventory. **It never submits** —
you review the filled form and click the marketplace's own button.

That boundary is deliberate. It's your marketplace account, and a listing that comes from
your real browser, on your real connection, in your real session looks like you because
it is you. Server-side automation is what gets seller accounts flagged.

## Install (unpacked)

1. Chrome → `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this `extension/` folder
4. Pin it to the toolbar

## Pair it

1. In Threader, go to **Extension** and generate a pairing code
2. Click the extension icon, paste the code
3. Set the address — `https://getthreader.com`, or `http://localhost:3737` while developing

The code is shown once and only its hash is stored, so a lost code means generating a new
one rather than recovering the old.

## Use it

1. In Threader: upload photos → identify → confirm → **Write listing copy**
2. Click the extension icon — drafted Depop and Mercari listings appear
3. Hit **Fill on Depop**. It opens the sell page, fills what it can, and shows a banner
   listing what it filled and what it couldn't
4. Set the dropdowns it left alone, check everything, submit yourself

## When a field stops filling

Depop and Mercari are React apps and change their markup without warning. Every
DOM-specific string lives in the `SELECTORS` map at the top of `fill-depop.js` and
`fill-mercari.js` — fix it there and nowhere else.

The banner reports missing fields by name, so "couldn't fill: price" tells you exactly
which selector went stale. **The selectors shipped here are unverified against the live
sites** — expect to correct them on first run.

Category, size, and condition are custom dropdown widgets rather than plain inputs, so
they're left to you on purpose. Automating them is brittle and they're three clicks.

## Files

```
manifest.json     MV3 manifest; host permissions per marketplace
background.js     talks to Threader, opens the tab, injects the filler
popup.js/html     pairing and the drafted-listing queue
fill-depop.js     Depop form filler — selectors at the top
fill-mercari.js   Mercari form filler — same shape
```
