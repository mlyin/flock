# Native Flock

Expo 57 / React Native 0.86. Native inventory, camera/library capture, garment
editing, draft sharing and account screens. Bundle: com.sellonflock.app.
The existing Supabase project supplies account-scoped inventory and private photos.
Sessions use SecureStore. Only public client credentials are bundled.

The sample closet is explicitly labeled, session-only and never writes cloud data.
Existing users sign in with email and password. Account help and deletion open the
existing secure website; deletion requires reauthentication there if necessary.
Shared drafts exclude costs and minimum prices. Sharing never posts a marketplace
listing. The app has no purchase flow or unimplemented push registration.

From mobile: npm ci; node --test src/model.check.cjs; npm run export:ios.
Generate Xcode with npm run ios:generate; run on a simulator with npm run ios.
GitHub iOS CI compiles and signs the Release simulator app, then uses Maestro to
verify sample inventory editing and tab navigation on iPhone and iPad. Matching
screenshots are stored in the simulator artifact. Codemagic's flock-ios workflow
uses the existing codemagic Apple integration and an App Store profile for
com.sellonflock.app. Build numbers start above 100.

Release requires native visual checks, real account and photo tests, matching
screenshots, and complete App Store privacy/age/review metadata. The sample closet
can be opened from sign-in or flock://sample, without a reviewer password.
