'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The native bridge.
//
// Nova ships as ONE codebase serving two runtimes: the web app on Vercel, and a
// bundled Capacitor app on iOS/Android. Every native capability in this file is
// reached through the same shape:
//
//     if (!isNative()) → fall back to the web behaviour that already worked
//
// and every Capacitor plugin is loaded with a DYNAMIC import, never a static
// one. That matters for two reasons:
//
//   1. The web bundle never downloads plugin code it can't use. Nothing about
//      the browser experience changes or gets heavier.
//   2. Several plugins (PushNotifications above all) have no web implementation
//      and THROW on import-time registration in a browser. A static import
//      would take the whole app down on the web to add a phone feature.
//
// So: web is the default and is never degraded; native is a strict superset.
// ─────────────────────────────────────────────────────────────────────────────

import { Capacitor } from '@capacitor/core';

export type NativePlatform = 'ios' | 'android' | 'web';

/** True only inside the bundled iOS/Android app — false in every browser. */
export function isNative(): boolean {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

export function nativePlatform(): NativePlatform {
  try { return Capacitor.getPlatform() as NativePlatform; } catch { return 'web'; }
}

export const isIOSNative     = () => isNative() && nativePlatform() === 'ios';
export const isAndroidNative = () => isNative() && nativePlatform() === 'android';

// A plugin import that fails must never take a screen down with it — a missing
// or broken plugin degrades to "the web behaviour", which is always a working
// path. Callers get null and branch on it.
export async function loadPlugin<T>(load: () => Promise<T>): Promise<T | null> {
  if (!isNative()) return null;
  try { return await load(); } catch { return null; }
}
