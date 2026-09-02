import type { CapacitorConfig } from '@capacitor/cli';

// Nova ships as a REAL bundled native app (not a website wrapper): the iOS/Android
// build embeds a static export of the UI (`out/`, produced by `npm run
// build:native`) and talks to the hosted API on Vercel via NEXT_PUBLIC_API_BASE.
//
//  • No `server.url` → the app loads its own bundled assets, works offline-first
//    for the shell, and launches instantly (no blank web load).
//  • `androidScheme: 'https'` serves the bundle from https://localhost on Android;
//    iOS serves from capacitor://localhost. Both are allow-listed for CORS in
//    middleware.ts so the bundled app can reach the Vercel API.
const config: CapacitorConfig = {
  appId: 'com.nova.discover',
  appName: 'Nova',
  webDir: 'out',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      // NativeShell hides this the moment React has mounted, so the user never
      // sees a blank frame between splash and UI. The duration below is only a
      // safety net for the case where the bundle fails to boot at all — without
      // it, a broken build would leave the splash on screen forever.
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#0a0a0f',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0f',
    },
    PushNotifications: {
      // Show banners even while Nova is foregrounded — iOS suppresses them by
      // default, which makes a live app look like it isn't receiving push.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#8b5cf6',
    },
  },
  android: {
    buildOptions: {
      keystorePath: 'nova-release.keystore',
      keystoreAlias: 'nova',
    },
  },
  ios: {
    scheme: 'Nova',
  },
  // NOTE — social sign-in also needs the custom URL scheme
  // `com.nova.discover://auth/callback` registered in three places, or the
  // provider has nowhere to return to (see src/lib/nativeAuth.ts):
  //   • ios/App/App/Info.plist            → CFBundleURLSchemes
  //   • android/.../AndroidManifest.xml   → a BROWSABLE intent-filter
  //   • Supabase dashboard                → Authentication → URL Configuration
};

export default config;
