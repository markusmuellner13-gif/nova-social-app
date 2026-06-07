import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nova.discover',
  appName: 'Nova',
  // The app is server-rendered (Next.js App Router) so Capacitor loads the
  // live Vercel URL inside a native WebView rather than bundled static files.
  webDir: 'public',
  server: {
    url: 'https://nova-phi-liart.vercel.app',
    androidScheme: 'https',
    cleartext: false,
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
