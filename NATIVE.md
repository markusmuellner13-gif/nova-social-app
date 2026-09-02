# Shipping Nova as a real native app (iOS + Android)

Nova is a **genuine bundled native app, not a website in a wrapper**:

- The UI is **statically exported and embedded in the app** (`out/`), so it
  launches instantly and the shell works offline — there is no `server.url`
  pointing at a website.
- Data comes from the **hosted API on Vercel**, reached cross-origin via
  `NEXT_PUBLIC_API_BASE` (CORS for the Capacitor origins is allow-listed in
  `middleware.ts`).
- It uses **real device capabilities** through Capacitor plugins: OS push
  (APNs/FCM), CoreLocation/FusedLocation, the system share sheet, the system
  browser for sign-in, status bar, splash, Android Back, and deep links.

This is the architecture Apple/Google expect, and it sidesteps the App Store
**Guideline 4.2 "minimum functionality"** rejection that URL-wrapper apps hit.

> **What still needs your accounts:** signing and submitting requires a paid
> Apple Developer and Google Play account. iOS additionally requires macOS.

---

## Current state

Already done and committed:

| | |
|---|---|
| `android/`, `ios/` | Native projects generated and configured |
| Icons + splash | Generated at every size for both platforms |
| `ic_stat_icon` | White-silhouette Android status-bar icon at 5 densities |
| Permissions | Location + `POST_NOTIFICATIONS` (Android), purpose strings (iOS) |
| Custom URL scheme | `com.nova.discover://` registered on both platforms |
| App Links / Universal Links | Intent filter + `/.well-known/` endpoints |
| Native push | Client registration + FCM/APNs senders, wired into both crons |
| Sign in with Apple | Implemented (Guideline 4.8) |

Still needs **your** accounts and machines — sections 3–6 below.

---

## 0. Prerequisites

**Android — already installed on this machine, no Android Studio needed:**

| | |
|---|---|
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` — cmdline-tools, platform-tools, platform 36, build-tools 35 + 36 |
| **JDK 21** | `%LOCALAPPDATA%\Programs\Java\jdk-21.0.12.1+1` |
| Env vars | `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `JAVA_HOME` set at user scope |

> **JDK 21, not 17.** Capacitor 8's plugins declare a Java 21 toolchain and
> Gradle refuses to substitute an older JDK — with 17 the build dies on
> `Cannot find a Java installation … matching {languageVersion=21}`. JDK 17
> still on the machine is fine; `JAVA_HOME` is what decides.
>
> `sdkmanager` is also **deprecated** — it now forwards to a new `android` CLI
> whose package names use slashes: `android sdk install platforms/android-36`,
> not `platforms;android-36`.

Android Studio is optional (`winget install Google.AndroidStudio`) and only
worth it for the emulator, the debugger and the release-signing wizard.

- **iOS:** a Mac with Xcode, and an Apple Developer Program account ($99/yr).
  The membership alone is not enough — Xcode runs only on macOS, so archiving
  needs a real Mac, a rented cloud Mac, or a macOS CI runner (Codemagic /
  Bitrise both support Capacitor).
- **Google Play Console** account ($25 once).

## 1. Build the bundle

```bash
export NEXT_PUBLIC_API_BASE="https://nova-phi-liart.vercel.app"   # or your custom domain
npm run build:native      # static export → out/
npx cap sync              # copy into android/ and ios/
```

`npm run build:android` / `npm run build:ios` do both in one step.
Re-run after **any** web change — the bundle is a snapshot, not a live URL.

## 2. Run it

Straight to an APK, no IDE:

```bash
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or open the IDEs:

```bash
npm run cap:open:android   # → Run from Android Studio
npm run cap:open:ios       # → Run from Xcode (Mac only)
```

**Verified working:** `assembleDebug` succeeds (337 tasks) and produces an
8.2 MB APK — `com.nova.discover`, minSdk 24 / targetSdk 36, with the bundled UI,
both deep-link intent filters and all five `ic_stat_icon` densities inside it.

Regenerating artwork, if the logo ever changes:

```bash
npm run assets && npm run cap:assets
node scripts/make-android-notification-icon.mjs
```

## 3. Push notifications

The app registers with the OS and sends the device token to
`/api/push/subscribe`; the digest and reminder crons deliver through
`src/lib/pushSend.ts`. **Every transport is independently gated** — with no keys
set, push simply doesn't send and nothing else breaks.

### Android (FCM)

**The Gradle side is already done** — Capacitor ships the `google-services`
classpath in `android/build.gradle` and a fail-soft `apply plugin` block at the
bottom of `android/app/build.gradle` that activates only when the JSON exists.
So there is one file to drop in and three env vars to set:

1. Create a Firebase project, add an Android app with package
   `com.nova.discover`, download **`google-services.json`** →
   `android/app/google-services.json`. (Gitignored — it is per-project config.)
2. Firebase Console → Project settings → Service accounts → **Generate new
   private key**. From that JSON, set on Vercel:
   ```
   FCM_PROJECT_ID=<project_id>
   FCM_CLIENT_EMAIL=<client_email>
   FCM_PRIVATE_KEY=<private_key, newlines as \n>
   ```

### iOS (APNs)

1. Apple Developer → Certificates, Identifiers & Profiles → **Keys** → new key
   with **Apple Push Notifications service (APNs)**. Download the `.p8` **once**.
2. Xcode → Signing & Capabilities → **+ Capability** → Push Notifications, and
   Background Modes → Remote notifications.
3. Vercel env:
   ```
   APNS_KEY_ID=<10-char key id>
   APNS_TEAM_ID=<10-char team id>
   APNS_PRIVATE_KEY=<contents of the .p8, newlines as \n>
   APNS_BUNDLE_ID=com.nova.discover
   APNS_PRODUCTION=1        # omit while testing with a debug build
   ```

> `APNS_PRODUCTION` must match the build. A TestFlight/App Store build needs
> `=1`; an Xcode debug build needs it unset. Mismatched, every send returns
> `BadDeviceToken` and the token is pruned.

## 4. Social sign-in

Sign-in opens the **system browser** and returns via a custom URL scheme —
Google refuses to render its consent screen inside an embedded WebView, and
`capacitor://localhost` is not a redirect target Supabase accepts.

In the **Supabase dashboard** → Authentication → URL Configuration → Redirect
URLs, add:

```
com.nova.discover://auth/callback
```

Then enable the **Apple** provider (Authentication → Providers). This is not
optional: App Store Guideline 4.8 requires Sign in with Apple in any app that
offers another third-party login, and Nova offers Google.

Apple's side: Developer portal → Identifiers → Services ID for Sign in with
Apple, with `https://<your-supabase-project>.supabase.co/auth/v1/callback` as
the return URL. Paste the resulting Services ID + key into Supabase.

To show the Apple button on the **web** too, set `NEXT_PUBLIC_APPLE_AUTH=1`.
It always shows in the native app.

## 5. Deep links (shared events open in the app)

`/.well-known/assetlinks.json` and `/.well-known/apple-app-site-association` are
live route handlers that **404 until configured**, so nothing broken is ever
served. Set on Vercel:

```
ANDROID_CERT_FINGERPRINT=AB:CD:…    # SHA-256, colon-separated
APPLE_APP_ID=<TeamID>.com.nova.discover
```

The Android fingerprint comes from:

```bash
keytool -list -v -keystore nova-release.keystore -alias nova    # look for SHA256:
```

Once enrolled in **Play App Signing**, use the SHA-256 from Play Console →
Setup → App signing instead — Play re-signs the upload, so the local keystore's
fingerprint stops matching what users install. Both may be listed, comma-separated.

On iOS, add **Associated Domains** in Xcode: `applinks:nova-phi-liart.vercel.app`.

## 6. Store submission

**Android — the keystore already exists.**

`android/nova-release.keystore` (RSA 4096, valid ~27 years) with its password in
`android/keystore.properties`. **Both are gitignored, so neither is backed up by
git — copy them somewhere safe.** Losing the keystore means never being able to
update Nova on Play again.

`android/app/build.gradle` reads those properties and signs `bundleRelease`
automatically; when the file is absent (fresh clone, CI) signing is skipped
rather than failing the build.

Its SHA-256, for `ANDROID_CERT_FINGERPRINT` (see § 5):

```
DE:D3:94:22:C0:68:52:19:75:3E:BB:DD:B4:45:95:5D:EF:29:28:3B:ED:62:01:15:C3:6C:73:F0:12:BB:E7:E3
```

> This is the **upload** key. The moment you enrol in Play App Signing, Google
> re-signs with a different key and users install *that* one — so App Links will
> break unless you switch this value to the SHA-256 from Play Console → Setup →
> App signing (or list both, comma-separated).

Build the upload artifact:

```bash
cd android && ./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

Then complete the **Data Safety** form (location, identifiers, notifications).

> **Timeline warning:** a *personal* Play developer account must run a closed
> test with 12+ testers opted in for 14 continuous days before it can apply for
> production access. Organisation accounts are exempt. Google has revised these
> terms more than once — check the current rule in Play Console, but plan for a
> two-week gate and start the closed test early.

**iOS**

Xcode → Product → Archive → distribute to App Store Connect. Fill in the privacy
nutrition labels (location, identifiers), screenshots, and link the privacy
policy (`/privacy`).

---

## Design notes

### Why `/api`, `/e`, `/business` and `/.well-known` are excluded from the bundle

`scripts/build-native.mjs` moves them aside during the export and restores them
after. Next refuses to statically export server route handlers or dynamic SSR
pages — and rightly so, they're the backend:

- **`api`** — the backend. Stays on Vercel.
- **`e`** — the public share page, whose whole job is to be a link-previewable
  web page for people who *don't* have the app.
- **`business`** — the paid advertising portal. Its Stripe Checkout inside an
  iOS binary is an App Store **Guideline 3.1.1** rejection, so the app doesn't
  ship it and hides the entry point on iOS entirely (`src/lib/openExternal.ts`).
  Android and web open it in the system browser as before.
- **`.well-known`** — the deep-link association files, which the phone reads
  *from the website*.

The web/Vercel build keeps every route; the export path only activates with
`NATIVE_EXPORT=1`.

### How the native code is structured

Every native capability sits behind a `src/lib/native.ts` guard and loads its
plugin with a **dynamic** import. So the web bundle never downloads plugin code,
and plugins with no web implementation (`PushNotifications` above all, which
throws on import in a browser) can't take the web app down.

| File | Role |
|---|---|
| `src/lib/native.ts` | Platform detection + safe plugin loading |
| `src/lib/geolocate.ts` | One geolocation API for both runtimes |
| `src/lib/nativePush.ts` | OS registration, token, notification taps |
| `src/lib/pushSend.ts` | Server: Web Push + FCM + APNs behind one call |
| `src/lib/nativeAuth.ts` | System-browser OAuth + deep-link return |
| `src/lib/nativeShare.ts` | System share sheet |
| `src/lib/openExternal.ts` | Web-hosted pages, opened correctly |
| `src/components/NativeShell.tsx` | Splash, status bar, Back, deep links, lifecycle |

On the web, every one of these short-circuits to the behaviour Nova already had.

### Known gaps

- **No offline data cache.** The app shell is bundled and launches offline, but
  feed content is fetched live; with no connection the feed is empty rather than
  stale-but-useful. A cache layer would be a genuine improvement, not a blocker.
- **iPad layout.** The UI is portrait-only by design (iOS is locked to portrait
  in `Info.plist`). Submit as iPhone-only unless the layout is adapted.
