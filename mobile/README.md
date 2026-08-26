# Flock for iOS

An Expo shell around www.sellonflock.com: one WKWebView pinned to the site, push
registration, an offline screen, and an allow-list that pushes every non-Flock URL out to
Safari. `SITE` at the top of `App.js` is the only place the domain appears.

**Never built, never submitted.** Everything below is the path from this repo to
TestFlight. The full submission checklist — guideline blockers, metadata, privacy labels,
screenshots — lives in **`docs/APP_STORE.md`**. This file is only the mobile build
mechanics.

**Built entirely from Windows.** EAS compiles iOS on Expo's hosted macOS workers, so no
Mac and no Xcode at any point in the build or submit pipeline. The one step that wants an
Apple device is *enrollment* identity verification (a photo-ID scan in the Apple Developer
app), and that is a ten-minute chore, not dev work.

---

## STOP — this project cannot be uploaded as it stands

`package.json` pins `expo: ~52.0.0` / `react-native: 0.76.5`. The default EAS build image
for SDK 52 is `macos-sequoia-15.3-xcode-16.2`, which links against the iOS 18 SDK.

Apple, since **28 April 2026**: apps uploaded to App Store Connect must be built with
Xcode 26 or later against an iOS 26 SDK. No grace period, no exception process.

The failure mode is nasty because it is late: **`eas build` succeeds and `eas submit`
fails.** The rejection happens at upload, before App Review ever sees the binary. Every
App Store Connect step below is wasted effort until the SDK moves.

**Do this first, not tenth:**

```powershell
cd C:\Users\mlyin\closet\mobile
npm install expo@^57.0.0
npx expo install --fix
npx expo-doctor
```

SDK 54 is the floor (its default image is Xcode 26.0); 57 is current. Two things bite on
the way up:

- **SDK 55 removed the Legacy Architecture entirely** — the `newArchEnabled` key is gone
  from the app config. `react-native-webview@13.12.5` predates that and must move to a
  New-Architecture-compatible release. `npx expo install --fix` picks the right pin.
- **Liquid Glass applies automatically** once built against the iOS 26 SDK. Expect the
  status bar and safe-area chrome to look different with zero code changes. Budget a
  visual pass rather than assuming a clean recompile.

There is no `ios/` directory here (CNG — native code is generated during the build), so
there is nothing to delete before upgrading.

The tempting shortcut — forcing `"image": "macos-sequoia-15.6-xcode-26.2"` onto SDK 52 in
the production profile — is deliberately **not** in `eas.json`. Expo declines to guarantee
that older SDKs compile under Xcode 26, and RN 0.76 predates it by two toolchain
generations. Treat it as a 15-minute experiment that costs one free-tier build, never as
the plan.

---

## What you need first

| | |
|---|---|
| Apple Developer Program | **$99/year.** Apple publishes **no approval SLA** — plan for days, possibly weeks. (An earlier version of this file said 24–48h; that figure is not from Apple.) Start enrollment *in parallel* with the SDK upgrade. |
| Expo account | Free. 15 iOS builds/month, low-priority queue, 45-minute build timeout. No overage charges — you get blocked, not billed. Enough to ship. |
| Node | ≥ 20. SDK 55+ narrows this to `^20.19.4 / ^22.13.0 / ^24.3.0 / ^25.0.0`. |
| EAS CLI | `npm install -g eas-cli` (22.x) |
| Your iPhone | For the 2FA code during `eas credentials`, and for TestFlight. |

The $299 figure that circulates online is the Apple Developer **Enterprise** Program,
which is for in-house distribution and **cannot publish to the App Store**. Do not enroll
in it.

---

## The sequence, from Windows PowerShell

```powershell
cd C:\Users\mlyin\closet\mobile
npm install
eas login
eas init                                        # writes the real projectId into app.json
eas credentials --platform ios                  # certificates + APNs key, no Mac involved
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

`eas build --platform ios --auto-submit` chains the last two. Run them separately the
first time so a failure is attributable to one or the other.

The steps that surprise people:

- **`eas init` is what unblocks push.** `App.js` calls
  `getExpoPushTokenAsync({ projectId })` reading
  `Constants.expoConfig?.extra?.eas?.projectId`, which is still the literal string
  `REPLACE_AFTER_EAS_INIT` in `app.json`. That throws. `eas init` replaces it — **do not
  hand-edit that value.**
- **`eas build:configure` is a no-op here** because `eas.json` already exists. Skip it.
- **`eas credentials`** logs into your Apple account and creates the Distribution
  Certificate, the app-specific Provisioning Profile, and the APNs `.p8` push key on
  Apple's servers, storing the private keys on Expo's. Account caps worth knowing: 2
  distribution certificates, 2 APNs keys, unlimited provisioning profiles. Your Apple
  password never reaches Expo's servers.
- **Build time** is roughly 10–20 minutes of compute once it starts, but the free tier is
  the low-priority queue at 1 concurrency — the wait before compute can exceed the build
  itself.
- **TestFlight** picks the build up 10–15 minutes after `eas submit` finishes. Internal
  testing needs no Beta App Review; external testing does, and that review runs the same
  guidelines as the real submission, so it doubles as a dry run.

---

## Every placeholder, and where its value comes from

`eas.json` is strict JSON and cannot carry comments, so the explanations live here.

### `mobile/app.json`

| Placeholder | Where it comes from |
|---|---|
| `extra.eas.projectId` = `REPLACE_AFTER_EAS_INIT` | Written automatically by `eas init`. Never type it by hand. |

### `mobile/eas.json` → `submit.production.ios`

This profile now uses the **App Store Connect API key** route rather than `appleId` +
app-specific password. Expo's docs call the API key "the default and recommended
authentication method": it is JWT-based and stateless, so there is no 2FA prompt, no Apple
web-session expiry, and no interactive re-auth mid-submit. The Apple ID route rides on
Apple's session machinery and is the most common cause of `eas submit` failures — a bad
fit for a Windows workflow.

| Field | Where its value comes from |
|---|---|
| `ascAppId` | App Store Connect → **Apps → your app → App Store tab → General → App Information → General Information → Apple ID**. A ~10-digit number. **Trap:** App Store Connect labels this field "Apple ID" and it is *not* your account email. Omitting the field entirely makes EAS Submit create the app record for you; filling it in skips creation. |
| `appleTeamId` | developer.apple.com/account → **Membership details**. 10 characters. |
| `ascApiKeyId` | App Store Connect → **Users and Access → Integrations → App Store Connect API** → the key's 10-character Key ID. Also embedded in the filename: `AuthKey_<KEYID>.p8`. |
| `ascApiKeyIssuerId` | Same screen, the UUID printed *above* the keys table. Identical for every key on the account. |
| `ascApiKeyPath` | Wherever you saved the `.p8`. Give the key at least **App Manager** access when creating it. **The .p8 downloads exactly once** — there is no second chance. |
| `groups: ["Internal"]` | A TestFlight **internal** group name, so every submit lands straight in it. **Create a group with exactly this name at App Store Connect → TestFlight → Internal Testing first, or delete this line** — submitting to a group that does not exist fails. |

**`mlyin/flock` is a public repo.** Save the `.p8` outside the working tree — e.g.
`C:\Users\mlyin\keys\AuthKey_XXXXXXXXXX.p8` — and point `ascApiKeyPath` at it. Cleanest
option of all: let `eas credentials --platform ios` generate and store an ASC API key
server-side, then delete `ascApiKeyPath`, `ascApiKeyId` and `ascApiKeyIssuerId` from
`eas.json` entirely, so the key never touches your disk.

Fallback route, if the API key path is blocked for some reason: put `appleId` back in the
submit profile and supply the app-specific password (generated at appleid.apple.com →
Sign-In and Security) through the environment, never in the file:

```powershell
$env:EXPO_APPLE_APP_SPECIFIC_PASSWORD = "abcd-efgh-ijkl-mnop"
eas submit --platform ios --profile production
```

### Version numbers

`cli.appVersionSource` is `remote` and the production profile sets `autoIncrement`, so
**EAS owns the build number server-side** and the local `"buildNumber": "1"` in `app.json`
is inert. That is the right setup for TestFlight — leave it. Bump `expo.version` in
`app.json` by hand for each App Store release.

`cli.version` is `>= 22.0.0` to match current eas-cli. If `eas --version` reports lower,
upgrade the CLI rather than lowering the floor.

---

## DECISION REQUIRED: `supportsTablet`

`app.json` currently has:

```json
"ios": { "supportsTablet": true, ... }
```

**Nothing in this pass changed it — declared device support is a product decision, not a
build detail.** But decide before the first build, because `UIDeviceFamily` is baked into
the binary and cannot be changed after upload without a new build.

`supportsTablet: true` means the app "runs on iPad", and therefore:

- **13-inch iPad screenshots become mandatory** — `2064 × 2752` or `2048 × 2732` — on top
  of the required 6.9-inch iPhone set. No screenshots exist anywhere in this repo today,
  so this doubles an asset job that has not started.
- **App Review will exercise the app on an iPad.** The WebView renders, but any layout in
  the Next.js app that breaks at 1032pt wide is a rejection on a device class Flock does
  not target.

`supportsTablet: false` means only the 6.9-inch iPhone set is required. The app still
installs on iPad in iPhone compatibility mode and must still not break there, but Apple
asks for no iPad screenshots and no iPad-specific scrutiny.

**Recommendation: set it to `false` for v1.0.** Flock is a phone-first tool — photograph a
garment, price it, draft it — and there is no iPad-specific product work here to defend.
Flipping it removes an entire required asset set and an entire review surface at no user
cost. Change it *before* `eas build`, or leave it alone for this release and budget the
iPad screenshots.

### Screenshots, whichever way that goes

Required: **6.9-inch iPhone, 1320 × 2868 portrait**, 1–10 images, PNG or JPEG, **no alpha
channel**. Plus the 13-inch iPad set if `supportsTablet` stays `true`.

Because the app *is* a WebView, a headless-Chrome capture at the right viewport and DPR is
dimensionally identical to a device screenshot — no Mac, no simulator. Viewport 440 × 956
at `deviceScaleFactor: 3` gives exactly 1320 × 2868; 1032 × 1376 at DPR 2 gives
2064 × 2752. Drive it with `playwright-core` against the Chrome already installed on this
machine.

Two traps: **never pass `omitBackground: true`** (it produces RGBA, which App Store
Connect rejects), and Guideline 2.3.3 forbids leading with the login or splash screen — so
capture signed-in states (inventory grid, a garment being priced, the post flow) by saving
a Playwright storage state once and reusing it.

---

## Guideline 4.2 — the thing that gets wrappers rejected

Apple rejects apps that are a website in a shell. What is actually implemented today:

- **Offline screen** with pull-to-refresh, not a browser error page. Real, and thin.
- **External links open in Safari** — real. Stripe checkout never runs in the embedded
  view.
- **Push notifications — registered, but the token goes nowhere.** An earlier version of
  this file called push "the one genuinely native capability here." That is false end to
  end. `App.js` posts `{type: "push-token"}` into the WebView and **nothing in the web app
  listens for it** — no handler exists in `app/`, `components/` or `lib/`. The server-side
  push system is W3C Web Push / VAPID only, and `lib/push.ts` cannot deliver to an
  `ExponentPushToken`. On top of that, `getExpoPushTokenAsync` throws while `projectId` is
  still the placeholder. The iOS app currently receives no notifications by any route.
- **The camera is NOT implemented.** `app.json` declares `NSCameraUsageDescription` and
  `App.js` sets `mediaCapturePermissionGrantType="grant"`, but `expo-camera` and
  `expo-image-picker` are not in `package.json`. Together those two lines only permit *the
  website's* file input and `getUserMedia` to work inside the wrapper — which is exactly
  what Safari already does. A usage string with no native capture behind it is a
  declaration, not a feature.

Apple's boilerplate 4.2 rejection names this situation almost verbatim: *"Including iOS
features such as push notifications, Core Location, and sharing do not provide a robust
enough experience to be appropriate for the App Store."*

So the honest position is that this shell offers an offline screen and pull-to-refresh
above what Safari already does. Closing 4.2 means a real native surface — native capture
feeding the existing intake pipeline, a Photos share extension so a garment photo can be
sent *into* Flock, native navigation chrome — plus making push actually deliver. Pick at
least one and build it before paying $99. Then make sure the reviewer *encounters* it: a
native feature nobody triggers does not count, so spell out where to tap in App Review
Information.

Related and easy to miss: **4.2.3(i) says the app must work on its own without requiring
another app.** The Settings page and the landing copy currently tell an iPhone user about
the desktop Chrome extension, and `/install` offers a ZIP of extension code. That is
ready-made rejection material. See `docs/APP_STORE.md`.

## Guideline 3.1.1 — subscriptions

Flock sells plans through Stripe, and paid tiers unlock in-app functionality. **The iOS
app must not sell anything.** The May 2025 US anti-steering change permits the *link out*
on the US storefront; it does not remove the requirement that features unlocked inside the
app be sold through IAP.

Safest v1: the app doesn't mention pricing at all. Users subscribe on the web and sign in
here.

---

## Everything else

`docs/APP_STORE.md` is the submission checklist: the 4.8 login-services blocker, account
deletion, privacy nutrition labels, age rating, App Store name and metadata, EU trader
status, and the enrollment decisions that are irreversible once made.
