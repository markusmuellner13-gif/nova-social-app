# Nova — release TODO & handoff

**How to use this file:** in a new session, say *"read TODO_RELEASE.md"*. It is
written to be self-contained — someone (or some Claude) with no memory of the
previous work should be able to pick up from here.

Companion docs: [`NATIVE.md`](NATIVE.md) (how the native app is built and why),
[`store/PLAY_LISTING.md`](store/PLAY_LISTING.md) (Play listing copy + Data Safety draft).

Last updated: **2026-09-02**, at commit `8115128` ("ship Nova as a real native app").

---

## 0. Where things stand

Nova is a **real bundled native app**, not a website in a wrapper: the UI is a
static export embedded in the app, and it talks to the Vercel API cross-origin.
The iOS and Android projects exist, are configured, and Android **compiles and
signs successfully**.

### Done and verified

| | Evidence |
|---|---|
| Web app unaffected | 387 tests, lint (0 errors), type-check, production build all green |
| Production deployed | `https://nova-phi-liart.vercel.app` on commit `8115128` |
| Android debug build | `assembleDebug` → 8.2 MB APK |
| Android release build | `bundleRelease` → 5.7 MB AAB, signed RSA 4096, `lintVitalRelease` clean |
| APK contents | bundled UI, both deep-link intent filters, 5 × `ic_stat_icon` densities |
| Native push code | client registration + FCM/APNs senders, wired into both crons |
| Sign in with Apple | implemented (App Store Guideline 4.8) |
| Icons + splash | 113 generated assets, both platforms |
| Listing artwork | `store/feature-graphic.png`, `store/icon-512.png` |

### NOT done — the honest gaps

1. **The app has never been run.** It compiles, signs and deploys, but nobody
   has watched it open. This is the single biggest unknown.
2. **Push is dark on both platforms** — the code is live but has no credentials.
3. **Deep links are dark** — the `/.well-known/` endpoints 404 until configured.
4. **iOS has never been built** — needs macOS.

---

## 1. Machine setup (already installed — don't redo)

| | Path |
|---|---|
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` (cmdline-tools, platform-tools, platform 36, build-tools 35 + 36) |
| JDK 21 | `%LOCALAPPDATA%\Programs\Java\jdk-21.0.12.1+1` |
| Env vars | `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `JAVA_HOME` set at **User** scope |

### Gotchas that already cost time — don't rediscover them

- **JDK 21 is required, not 17.** Capacitor 8 plugins declare a Java 21
  toolchain; Gradle will not substitute an older JDK. Failure mode:
  `Cannot find a Java installation … matching {languageVersion=21}`.
- **`sdkmanager` is deprecated.** It forwards to a new `android` CLI whose
  package names use **slashes**: `android sdk install platforms/android-36`,
  not `platforms;android-36`.
- **This machine cannot run elevated installers** from a tool call — no one can
  accept the UAC prompt. MSIs fail with **exit 1602**. Install by downloading a
  ZIP and extracting under `%LOCALAPPDATA%\Programs\...`.
- **`npm run cap:assets` will vandalise the web app** if run without
  `--ios --android`. It targets `pwa` too and deletes
  `public/apple-touch-icon.png` and overwrites `public/manifest.json`. The
  package.json script is already fixed — don't "simplify" it back.
- **Don't write `.properties` files with PowerShell `-Encoding utf8`** — it adds
  a BOM, and Java's `Properties` loader folds the BOM into the first key, so
  `storeFile` silently reads as `null`.
- **Vercel preview URLs are behind SSO.** `curl` gets `200` + a login page for
  every path, including ones that should 404. Smoke-test **production**, or
  fetch previews through the Vercel MCP tool.

### Build commands

```bash
# Web bundle → native projects (re-run after ANY web change)
NEXT_PUBLIC_API_BASE=https://nova-phi-liart.vercel.app npm run build:native
npx cap sync

# Android
cd android && ./gradlew assembleDebug     # → app/build/outputs/apk/debug/app-debug.apk
cd android && ./gradlew bundleRelease     # → app/build/outputs/bundle/release/app-release.aab
```

---

## 2. 🔴 SECRETS — back these up, they are NOT in git

| File | What it is |
|---|---|
| `android/nova-release.keystore` | The release signing key. **Lose it and Nova can never be updated on Play again.** |
| `android/keystore.properties` | Its password (also gitignored) |

Copy both somewhere durable (password manager / encrypted backup) **outside this
repo**. Both are gitignored on purpose, which also means no commit backs them up.

Upload-key SHA-256 (public, safe to share — needed for App Links):

```
DE:D3:94:22:C0:68:52:19:75:3E:BB:DD:B4:45:95:5D:EF:29:28:3B:ED:62:01:15:C3:6C:73:F0:12:BB:E7:E3
```

---

## 3. TODO — Android / Google Play

### 3.1 Run the app on a real device ⬅️ **do this first**

Nothing else is worth doing until we know it actually opens. Two routes:

**A. Physical phone (no admin needed).** Enable Developer Options → USB
debugging, plug in, then:

```bash
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -s Capacitor:* chromium:* AndroidRuntime:*     # watch for crashes
adb exec-out screencap -p > shot.png                      # store screenshots
```

**B. Emulator (needs admin once).** In an **Administrator** PowerShell:

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All
```

Reboot, then:

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
& "$sdk\cmdline-tools\latest\bin\android.exe" sdk install emulator "system-images/android-36/google_apis/x86_64"
```

The CPU already supports virtualization (`VirtualizationFirmwareEnabled: True`,
SLAT `True`) — only the Windows feature is switched off.

**What to actually check once it opens:**

- [ ] Splash disappears and the feed renders (not a blank/white screen)
- [ ] Location permission dialog appears **only** after tapping "use my location",
      never at cold start
- [ ] Feed loads real events for your city (proves `NEXT_PUBLIC_API_BASE` + CORS)
- [ ] Map and turn-by-turn navigation work
- [ ] Android **Back** navigates between screens and only exits from the root
- [ ] Share sheet opens the OS sheet (not a WebView popup)
- [ ] Google sign-in opens the **system browser** and returns into the app
- [ ] "List your business" opens in the system browser
- [ ] Status bar is light-on-dark, nothing hidden under the notch

### 3.2 Push notifications (FCM)

The Gradle side is **already wired** — Capacitor ships the `google-services`
classpath and a fail-soft `apply plugin` block. Only two things are missing:

- [ ] Firebase project → add Android app with package `com.nova.discover` →
      download `google-services.json` → `android/app/google-services.json`
- [ ] Firebase → Project settings → Service accounts → Generate new private key.
      Set on **Vercel**: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`
      (newlines as `\n`)
- [ ] Verify: run `/api/cron/push` with the `CRON_SECRET` and confirm a
      notification arrives with the **white pin** status-bar icon (not a white square)

### 3.3 Deep links (shared events open in the app)

- [ ] Set `ANDROID_CERT_FINGERPRINT` on Vercel to the SHA-256 above
- [ ] Confirm `https://nova-phi-liart.vercel.app/.well-known/assetlinks.json`
      returns JSON instead of 404
- [ ] ⚠️ **After enrolling in Play App Signing**, Google re-signs with a
      *different* key — switch this value to the SHA-256 from Play Console →
      Setup → App signing, or App Links break for everyone who installed from
      Play. Both may be listed, comma-separated.
- [ ] Verify: `adb shell am start -a android.intent.action.VIEW -d "https://nova-phi-liart.vercel.app/e/test"`
      should open Nova, not Chrome

### 3.4 Social sign-in

- [ ] Supabase → Authentication → URL Configuration → Redirect URLs: add
      `com.nova.discover://auth/callback`
- [ ] Supabase → Providers → enable **Apple** (needs an Apple Services ID; see § 4)
- [ ] Optional: `NEXT_PUBLIC_APPLE_AUTH=1` to also show the Apple button on web

### 3.5 Play Console

- [ ] Create the account ($25) and complete identity verification (takes days)
- [ ] Bump `versionCode` in `android/app/build.gradle` before every upload —
      Play rejects a repeat. Currently `1`.
- [ ] Upload `app-release.aab`
- [ ] Complete the **Data Safety** form — draft answers in
      `store/PLAY_LISTING.md`, including two questions that depend on whether
      AdSense is live in production
- [ ] Complete the **content rating** questionnaire (Nova has user-generated
      content via groups/shared events)
- [ ] Upload 2–8 phone screenshots (blocked on § 3.1)
- [ ] ⚠️ **Personal accounts: closed test with 12+ testers for 14 continuous
      days** before you can apply for production access. Organisation accounts
      are exempt. Google has revised these terms more than once — check the
      current rule, but **start the closed test early**, it is a calendar gate,
      not a work item.

---

## 4. TODO — iOS / App Store

**You need macOS.** The $99 Apple Developer membership lets you sign and submit;
it does not compile anything. Options: a rented cloud Mac (Scaleway / MacStadium
/ AWS EC2 Mac), a macOS CI runner (**Codemagic** is the least friction for
Capacitor; Bitrise also works), or a used Mac mini.

- [ ] Get macOS access, then `npm run build:ios && npm run cap:open:ios`
- [ ] Xcode → Signing & Capabilities: set the team, add **Push Notifications**,
      **Background Modes → Remote notifications**, and **Associated Domains** →
      `applinks:nova-phi-liart.vercel.app`
- [ ] APNs: Apple Developer → Keys → new key with APNs → download the `.p8` **once**.
      Set on Vercel: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`,
      `APNS_BUNDLE_ID=com.nova.discover`, `APNS_PRODUCTION`
- [ ] ⚠️ `APNS_PRODUCTION` **must match the build**: `1` for TestFlight/App Store,
      unset for an Xcode debug build. Mismatched, every send returns
      `BadDeviceToken` and the token gets pruned.
- [ ] Sign in with Apple: Developer portal → Identifiers → Services ID, return URL
      `https://<supabase-project>.supabase.co/auth/v1/callback`; paste the
      Services ID + key into Supabase
- [ ] Set `APPLE_APP_ID=<TeamID>.com.nova.discover` on Vercel, confirm
      `/.well-known/apple-app-site-association` stops 404ing
- [ ] Screenshots at required device sizes, privacy nutrition labels
- [ ] Archive → App Store Connect → TestFlight → review

**Review risks already mitigated** (don't undo these):
- *4.2 minimum functionality* — the app bundles its UI, no `server.url`
- *4.8 Sign in with Apple* — implemented, required because Google login is offered
- *3.1.1 external purchases* — `/business` is excluded from the bundle and its
  entry points are hidden entirely on iOS (`src/lib/openExternal.ts`)

---

## 5. Known gaps / possible follow-up work

Not blockers — judgement calls worth revisiting.

- **No offline data cache.** The shell launches offline but the feed fetches
  live, so with no connection you get an empty feed rather than
  stale-but-useful content. A real improvement, not a release blocker.
- **App-icon badge does nothing natively.** `setAppBadge()` uses the web
  Badging API, absent in a WebView. Fixing it means sending `aps.badge` in the
  APNs payload and tracking unread count server-side.
- **iPad.** The layout is portrait-only (locked in `Info.plist`). Submit as
  iPhone-only unless it is adapted.
- **R8/minification is deliberately OFF** for release. All app logic is
  JavaScript inside the bundle, which R8 cannot shrink, so it buys almost
  nothing while risking release-only crashes from stripped plugin classes
  reached reflectively from JS. Reconsider only if native code grows.
- **`.env.example` is gitignored** (`.env*`), so the documented env vars live
  only on this machine. `NATIVE.md` carries them into git.

---

## 6. Where the native code lives

Every native capability sits behind an `isNative()` guard and loads its plugin
with a **dynamic** import — so the web bundle never ships plugin code, and
plugins with no web implementation can't break the browser app. **On the web,
every path below short-circuits to the behaviour Nova already had.** Keep it
that way.

| File | Role |
|---|---|
| `src/lib/native.ts` | Platform detection + safe plugin loading |
| `src/lib/geolocate.ts` | One geolocation API for both runtimes |
| `src/lib/nativePush.ts` | OS registration, device token, notification taps |
| `src/lib/pushSend.ts` | **Server**: Web Push + FCM + APNs behind one call |
| `src/lib/nativeAuth.ts` | System-browser OAuth + deep-link return |
| `src/lib/nativeShare.ts` | System share sheet |
| `src/lib/openExternal.ts` | Web-hosted pages; hides the portal on iOS |
| `src/components/NativeShell.tsx` | Splash, status bar, Back, deep links, lifecycle |
| `scripts/build-native.mjs` | Static export; excludes `api`, `e`, `business`, `.well-known` |
| `scripts/make-assets.mjs` | Regenerates icon + splash sources |
| `scripts/make-android-notification-icon.mjs` | Regenerates `ic_stat_icon` |
| `scripts/make-store-assets.mjs` | Regenerates the Play feature graphic |
