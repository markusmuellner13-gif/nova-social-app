# Shipping Nova as a real native app (iOS + Android)

Nova is built so the mobile apps are **genuine bundled native apps, not a website
in a wrapper**:

- The UI is **statically exported and embedded in the app** (`out/`), so it
  launches instantly and the shell works offline — there is no `server.url`
  pointing at a website.
- Data comes from the **hosted API on Vercel**, reached cross-origin via
  `NEXT_PUBLIC_API_BASE` (CORS for the Capacitor origins is allow-listed in
  `middleware.ts`).
- It uses **native device capabilities** (push notifications, geolocation,
  share, status bar, splash) through Capacitor plugins.

This is the architecture Apple/Google expect, and it sidesteps the App Store
**Guideline 4.2 "minimum functionality"** rejection that pure URL-wrapper apps hit.

> **What can't be done from CI / the cloud:** compiling, signing, and submitting
> native binaries requires a Mac (Xcode) and Android Studio plus your paid Apple
> Developer and Google Play accounts. The steps below run on **your machine**.

---

## 0. Prerequisites (one time)

- **Apple:** a Mac with **Xcode**, an **Apple Developer Program** account ($99/yr).
- **Android:** **Android Studio** + JDK 17, a **Google Play Console** account ($25 once).
- Node 20+ and this repo cloned locally.

Install the native runtimes + the plugins the app uses:

```bash
npm install
npm install @capacitor/ios @capacitor/android \
  @capacitor/push-notifications @capacitor/geolocation @capacitor/share \
  @capacitor/status-bar @capacitor/splash-screen @capacitor/app @capacitor/network
npm install -D @capacitor/assets
```

## 1. Point the bundle at your hosted API

The native app calls the Vercel backend. Set the production origin (the same one
the web app is served from):

```bash
export NEXT_PUBLIC_API_BASE="https://nova-phi-liart.vercel.app"   # or your custom domain
```

(Use your real production domain once the DNS is set.)

## 2. Build the bundled front-end

```bash
npm run build:native      # static export → out/  (server routes are auto-excluded)
```

## 3. Add the native projects (one time)

```bash
npm run cap:add:ios
npm run cap:add:android
```

## 4. App icon & splash screen

Drop a square **1024×1024** `assets/icon.png` and a **2732×2732**
`assets/splash.png` (dark, `#0a0a0f` background) into an `assets/` folder, then:

```bash
npm run cap:assets        # generates every icon/splash size for both platforms
```

## 5. Sync, open, run

```bash
npm run cap:sync
npm run cap:open:ios       # → run on a simulator / device from Xcode
npm run cap:open:android   # → run from Android Studio
```

Re-run `npm run build:native && npm run cap:sync` after any web change.

## 6. Native enhancements to wire before store submission

The web app already uses browser geolocation and web-push, which work in the
WebView, but native plugins are more reliable and are what reviewers look for:

- **Push:** initialise `@capacitor/push-notifications` (request permission,
  register, send the APNs/FCM token to `/api/push/subscribe`). Configure APNs
  key (iOS) and a Firebase project (Android).
- **Geolocation:** prefer `@capacitor/geolocation` over `navigator.geolocation`.
- **Share:** use `@capacitor/share` for the share buttons.
- **Status bar / splash:** already configured in `capacitor.config.ts`.

## 7. Store submission

- **iOS:** Xcode → Product → Archive → distribute to App Store Connect; fill in
  privacy nutrition labels (location, identifiers), screenshots, and link the
  privacy policy (`/privacy`).
- **Android:** build a signed **AAB** with the `nova-release.keystore` referenced
  in `capacitor.config.ts` (create it with `keytool`), upload in Play Console,
  complete the Data Safety form.

---

## Why the build temporarily moves `/api` and `/e`

`scripts/build-native.mjs` moves `src/app/api` and `src/app/e` aside during the
export and restores them after. Next.js refuses to statically export a project
that contains server **route handlers** or **dynamic SSR pages** — and rightly
so, they're the backend and the web-only share page. Excluding them yields a
clean static UI bundle while the web/Vercel build keeps every route. The web
build is untouched (the export path only activates with `NATIVE_EXPORT=1`).
