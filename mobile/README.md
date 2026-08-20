# Flock for iOS

An Expo shell around sellonflock.com, plus the native pieces a browser can't give
you: push that arrives when the app is closed, and the system camera.

**Built entirely from Windows.** EAS compiles iOS on Apple hardware in the cloud, so
no Mac and no Xcode.

## What you need first

| | |
|---|---|
| Apple Developer Program | $99/year — enrollment takes **24–48h**, longer for a company |
| Expo account | free — expo.dev |
| EAS CLI | `npm install -g eas-cli` |

## Build and submit

```bash
cd mobile
npm install
eas login
eas init                      # writes the projectId into app.json
eas build --platform ios --profile production
eas submit --platform ios --latest
```

`eas build` asks whether to generate signing credentials — say yes. EAS creates and
stores the certificate and provisioning profile for you; that step is the one that
normally requires a Mac.

Before `eas submit`, create the app record in App Store Connect and fill in the three
placeholders in `eas.json` (`appleId`, `ascAppId`, `appleTeamId`).

## Guideline 4.2 — the thing that gets wrappers rejected

Apple rejects apps that are a website in a shell. What's here to answer that:

- **Push notifications** — buyer messages reach the phone with the app closed
- **System camera and photo library**, declared with usage strings in `app.json`
- **Offline screen** with pull-to-refresh, not a browser error page
- **External links open in Safari** — OAuth and Stripe never run in the embedded view

Realistically this is still the likeliest rejection reason. If it comes back, the usual
fix is more native surface: a Photos share extension so a garment can be sent into Flock
from the camera roll, or a home-screen widget showing what's live.

## Guideline 3.1.1 — subscriptions

Flock sells plans through Stripe. **The iOS app must not sell anything.** Linking out to
web checkout from inside the app is permitted only in the US storefront, under the 2025
external-purchase entitlement. Everywhere else, an in-app path to a non-Apple payment is
a rejection.

Safest v1: the app doesn't mention pricing at all. Users subscribe on the web and sign
in here.

## Notes

- `SITE` at the top of `App.js` is the only place the domain appears.
- Bump `version` in `app.json` for each App Store release; `buildNumber` is
  auto-incremented by the `production` profile.
