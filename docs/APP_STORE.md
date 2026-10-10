# Flock App Store release checklist

Current state: the mobile toolchain has been upgraded to Expo 57. The Xcode project
is generated locally or in CI. No signed archive, TestFlight upload, or App Store
submission has been completed by this change.

## Before a signed build

- Restore the Flock Supabase project and verify real sign-in, inventory, photo
  upload, listing, and account deletion on the production site.
- Link the owner's Expo account with `eas init`; use the owner's active Apple
  Developer membership and confirm `com.sellonflock.app` is available.
- Run the Xcode simulator workflow and test on a real iPhone and iPad. The app
  currently declares tablet support, so include iPad layouts and screenshots.
- Use Xcode 26 or later with an iOS 26 SDK, as required for uploads since April
  28, 2026. A successful Metro export alone does not prove native build success.

## Product work and review

- Finish and test mobile authentication. The current Google OAuth flow runs in an
  embedded WebView; it needs a supported system-browser/native flow with a verified
  callback. Configure and test Sign in with Apple if required by guideline 4.8.
- Build a useful native experience and test it end to end. This is currently a
  website shell, which can fail minimum-functionality guideline 4.2. Camera usage
  descriptions and a WebView file picker do not establish a distinct native flow.
- If offering native push, implement authenticated token registration, logout
  cleanup, delivery, and notification navigation before enabling its permission
  prompt. The existing server supports web push, not Expo push tokens.
- Confirm the payment flow against Apple's rules for the intended storefronts and
  services. The web app links to Stripe for plans that unlock app functionality;
  opening a browser does not by itself establish App Store compliance.
- Verify the app's core flow works without a desktop browser extension. Adapt
  installation instructions and unsupported listing actions for mobile users.
- Test recovery from network loss and server errors. The shell does not implement
  an offline photo queue; do not promise that unsaved photos are retained.

## App Store Connect

- Create the app record, select the correct team and bundle ID, and supply support
  and privacy URLs, description, keywords, category, age rating, and applicable
  trader information.
- Complete privacy disclosures from the data actually collected by the app and
  its SDKs. Verify the privacy policy, account deletion, and retention behavior.
- Capture genuine device/simulator screenshots of the final signed-in experience
  for the required iPhone and iPad sizes. Do not substitute web screenshots for
  untested native screens.
- Provide working reviewer access and clear instructions for any non-obvious flow.
- Upload a signed production archive to TestFlight, test installation and core
  flows, then select the build for App Review. Uploading alone is not publication.

References: [Apple upcoming requirements](https://developer.apple.com/news/upcoming-requirements/?id=04282026a),
[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
[Expo iOS submission](https://docs.expo.dev/submit/ios/).
