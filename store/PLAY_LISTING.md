# Google Play listing pack — Nova

Everything here is a **draft you must check before submitting**. The Data Safety
form is a legal declaration: Google suspends apps whose declaration doesn't match
their behaviour. I derived these answers from the code and `/privacy`, but only
you know which optional integrations you actually switch on in production.

---

## Upload artifact

```
android/app/build/outputs/bundle/release/app-release.aab      5.7 MB
```

Signed with `CN=Nova, O=Nova, C=AT`, RSA 4096 / SHA384withRSA.
`versionCode 1`, `versionName 1.0` — bump `versionCode` in
`android/app/build.gradle` for every upload; Play rejects a repeat.

---

## Store listing copy

**App name** (≤30) — `Nova — Discover Your World`

**Short description** (≤80)

> Find real events, places and things to do near you — updated every day.

**Full description** (≤4000)

> Nova shows you what's actually happening around you right now.
>
> Concerts, exhibitions, markets, food, nightlife, sightseeing and the small
> local things that never make it into a search engine — all pulled from real
> event sources and real venues, sorted by how close they are to you.
>
> • **Near you first** — your city's feed, not a generic national listing
> • **Real events, real photos** — nothing invented, no stock imagery
> • **Far Far Away** — browse another city before you travel there
> • **Maps and navigation** — see what's around you and get walking or driving
>   directions to it
> • **Groups** — share plans with friends and see what they're going to
> • **Reminders** — get told before something you saved starts
>
> Nova works in your language and adapts to what you actually open.

**Category** — Events (alternative: Travel & Local)
**Tags** — events, local, discovery, maps, nightlife
**Contact email** — markusmuellner13@gmail.com
**Privacy policy URL** — `https://nova-phi-liart.vercel.app/privacy`

---

## Graphics

| Asset | Status |
|---|---|
| App icon 512×512 | ✅ `android/app/src/main/res/mipmap-*` (Play wants a separate 512×512 PNG — export from `assets/icon.png`) |
| Feature graphic 1024×500 | ✅ `store/feature-graphic.png` (no alpha, as Play requires) |
| Phone screenshots (2–8, min 320px, 16:9 or 9:16) | ❌ **needs a device** — see below |
| 7"/10" tablet screenshots | Optional unless you list tablet support |

Screenshots are the one listing asset I could not produce: the emulator needs
Windows Hypervisor Platform, which needs admin rights on this machine. Either
enable it (§ below) or capture them from a phone with
`adb exec-out screencap -p > shot.png`.

---

## Data Safety form — draft answers

### Does your app collect or share any of the required user data types? **Yes**

| Data type | Collected | Shared | Required? | Purpose |
|---|---|---|---|---|
| **Approximate location** | Yes | No | Optional | App functionality (the city feed) |
| **Precise location** | Yes | No | Optional | App functionality (map + turn-by-turn navigation) |
| **Email address** | Yes | No | Optional | Account management |
| **User IDs** | Yes | No | Optional | Account management |
| **Name** (username / display name) | Yes | No | Optional | Account management, app functionality |
| **Photos** (avatar) | Yes | No | Optional | Account management |
| **App interactions** | Yes | No | Optional | Analytics, app functionality (the feed personalises to what you open) |
| **Crash logs / diagnostics** | Yes | No | Optional | Crash reporting (Sentry) |

**Every row is Optional, not Required** — Nova works signed-out and without
location (you can pick a city by hand). Answer honestly here; "required" would
be wrong and is the kind of mismatch Google flags.

### Security answers

- **Encrypted in transit?** Yes — HTTPS everywhere; the app's CSP and CORS
  allow-list are in `middleware.ts`.
- **Can users request deletion?** Yes — there is an account-deletion endpoint
  (`/api/account/delete`).

### ⚠️ Two answers you must decide, because they depend on your production config

1. **Google AdSense.** `src/components/ConsentedAdsScript.tsx` loads AdSense
   **only** when `NEXT_PUBLIC_ADSENSE_CLIENT_ID` is set *and* the user has
   accepted cookies. If you ship with ads enabled, you must additionally
   declare **Device or other IDs → Collected + Shared, purpose: Advertising**,
   and complete Play's **Ads** declaration ("Does your app contain ads?" → Yes).
   If the env var is unset in production, leave both off.
2. **Vercel Analytics.** Consent-gated (`ConsentedAnalytics`) and anonymous —
   covered by "App interactions → Analytics" above. Confirm it is anonymous in
   your Vercel plan before declaring it as such.

### Also required

- **Content rating questionnaire** — Nova has user-generated content (groups,
  shared events), so answer the UGC questions truthfully; expect PEGI 12 / T.
- **Target audience** — 13+. The privacy policy's "Children" section already
  states Nova is not directed at children.
- **Ads declaration** — see AdSense above.
- **Government app / financial features** — No.

---

## Pre-launch checklist

- [ ] Play Console account created, identity verified (takes days)
- [ ] `google-services.json` added → **push works on Android** (see NATIVE.md § 3)
- [ ] `FCM_*` env vars set on Vercel
- [ ] `ANDROID_CERT_FINGERPRINT` set → shared links open in the app
- [ ] Screenshots captured
- [ ] Data Safety form completed (above)
- [ ] Content rating questionnaire completed
- [ ] **App tested on a real device** — not yet done
- [ ] Closed test with 12 testers started (personal accounts: 14-day gate)
- [ ] `nova-release.keystore` + `keystore.properties` backed up **outside git**

---

## Enabling the emulator (needs admin)

In an **Administrator** PowerShell:

```powershell
Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All
```

Reboot, then:

```powershell
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
& "$sdk\cmdline-tools\latest\bin\android.exe" sdk install emulator "system-images/android-36/google_apis/x86_64"
```

Your CPU already supports it (`VirtualizationFirmwareEnabled: True`,
`SecondLevelAddressTranslation: True`) — only the Windows feature is off.
