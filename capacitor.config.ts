import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nova.discover',
  appName: 'Nova',
  webDir: 'out',
  // Use bundled assets, no live-reload in production
  server: {
    androidScheme: 'https',
    // For local dev with live-reload:
    // url: 'http://192.168.x.x:3000',
    // cleartext: true,
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
