# Flock for iOS

An Expo shell around sellonflock.com, plus push that arrives when the app is closed.

**Never built, never submitted.** `eas.json` still carries placeholder Apple
credentials, and see the Guideline 4.2 section below before spending anything —
as it stands this is a website in a wrapper with one native feature.

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

Apple rejects apps that are a website in a shell. What is actually implemented today:

- **Push notifications** — real. `expo-notifications` registers for APNs and hands the
  token to the web app, so buyer messages arrive with the app closed. This is the one
  genuinely native capability here.
- **Offline screen** with pull-to-refresh, not a browser error page. Real, and thin.
- **External links open in Safari** — real. OAuth and Stripe never run in the embedded
  view.

**The camera is NOT implemented, and an earlier version of this file said it was.**
`app.json` declares `NSCameraUsageDescription`, and `App.js` sets
`mediaCapturePermissionGrantType="grant"` on the WebView. Both are real lines of
config, and neither is native functionality: together they only permit *the website's*
file input and `getUserMedia` to work inside the wrapper. `expo-camera` and
`expo-image-picker` are not in `package.json`. A usage string with no native capture
behind it is a declaration, not a feature, and a reviewer looking for native surface
will not find one.

So the honest position is that this shell currently offers **push and nothing else**
above what Safari already does, and 4.2 is the likeliest rejection by a distance.
Closing it means a real native surface — capture a garment photo in the app and feed it
to the existing intake pipeline, a Photos share extension so something can be sent into
Flock from the camera roll, or a home-screen widget. Pick one and build it before
paying $99.

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
