# Flock for iOS

Expo 57 / React Native 0.86 app loading https://www.sellonflock.com in WKWebView.
The native project is generated from `app.json`; do not hand-edit generated `ios/`
files. Bundle identifier: `com.sellonflock.app`. iPhone and iPad are enabled.

## Run in Xcode on a Mac

Install Xcode 26 with the iOS 26 SDK (or a compatible newer toolchain), its command
line tools, Node 24, and CocoaPods. Open Xcode once to finish setup and install an
iOS Simulator runtime.

```sh
cd mobile
npm ci
npm run ios:generate
npm run ios:open
```

In Xcode, select the **Flock** scheme and an iPhone simulator, then Run. For a
physical iPhone, select your Apple team under Signing & Capabilities and choose
the connected device. Alternatively, `npm run ios` compiles and launches the
simulator through Expo. A simulator build does not need distribution credentials.

`npm run ios:generate` can regenerate native files; keep native configuration in
`app.json` or Expo config plugins. `mobile/ios` and build output are ignored.

## Checks

```sh
npm run check
npx expo-doctor
npm run export:ios
node --test navigation.check.cjs
```

The `iOS Xcode build` GitHub workflow installs pods, compiles the Release simulator
app on macOS 26, and uploads a simulator artifact. A simulator artifact cannot be
uploaded to App Store Connect. Native compile and physical-device testing remain
separate from a successful JavaScript bundle export.

The navigation policy in `navigation.cjs` validates HTTPS origins, sends ordinary
external links to the browser, blocks executable schemes, and restricts notification
deep links to Flock. The URL polyfill provides the same parser on React Native.

## Distribution through Expo

```sh
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest credentials --platform ios
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production
```

`eas init` links the actual Expo account and writes its project UUID to `app.json`.
No fake account IDs or signing-key paths are checked in. The empty submit profile
allows EAS to prompt for the real App Store Connect app and credentials. Store
private keys outside this public repository or in EAS's credential store.

Profiles: `development` includes the Expo development client; `simulator` creates
an unsigned simulator build; `preview` targets registered physical devices;
`production` creates an App Store distribution build with remote build numbering.
Confirm the selected EAS image uses Xcode 26 or later before uploading.

Uploading with EAS Submit sends a build to App Store Connect/TestFlight. It does
not publish an App Store release. See [submission checklist](../docs/APP_STORE.md)
for the remaining product, account, and review requirements.

Native push permission is disabled until `extra.nativePushEnabled` is explicitly
true and a real EAS project is linked. Keep it disabled until the web app saves
Expo tokens for authenticated users and the backend can deliver to those tokens.
The existing web push sender uses a different protocol.
