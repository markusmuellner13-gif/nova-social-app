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
      launchShowDuration: 1500,
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
      presentationOptions: ['badge', 'sound', 'alert'],
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
};

export default config;
