#!/usr/bin/env node
/**
 * Build the bundled native front-end for Capacitor (iOS/Android).
 *
 * Next.js can't `output: export` a project that also contains server route
 * handlers (`/api/*`) or dynamic SSR pages (`/e/[id]`) — and it shouldn't: those
 * are the backend and stay on Vercel. So for the native bundle we temporarily
 * move the server-only routes aside, statically export just the app UI into
 * `out/`, then restore everything. The exported app calls the hosted API via
 * NEXT_PUBLIC_API_BASE (see src/lib/apiBase.ts) with CORS allow-listed in
 * middleware.ts. The result is a genuine offline-capable bundled app, not a
 * URL wrapper.
 *
 * Usage:
 *   NEXT_PUBLIC_API_BASE=https://your-prod-domain npm run build:native
 *   npx cap sync           # copy out/ into the native projects
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const APP = join(ROOT, 'src', 'app');
const STASH = join(ROOT, '.native-stash');

// Server-only routes that must not be part of a static export.
const SERVER_ONLY = ['api', 'e'];

const apiBase = process.env.NEXT_PUBLIC_API_BASE || '';
if (!apiBase) {
  console.warn(
    '\n⚠  NEXT_PUBLIC_API_BASE is not set — the bundled app will try same-origin\n' +
    '   API calls and fail on device. Set it to your hosted origin, e.g.\n' +
    '   NEXT_PUBLIC_API_BASE=https://nova-phi-liart.vercel.app npm run build:native\n'
  );
}

function stash() {
  mkdirSync(STASH, { recursive: true });
  for (const dir of SERVER_ONLY) {
    const from = join(APP, dir);
    if (existsSync(from)) renameSync(from, join(STASH, dir));
  }
}
function restore() {
  for (const dir of SERVER_ONLY) {
    const from = join(STASH, dir);
    if (existsSync(from)) renameSync(from, join(APP, dir));
  }
  rmSync(STASH, { recursive: true, force: true });
}

console.log('▶ Building bundled native front-end (static export)…');
rmSync(join(ROOT, 'out'), { recursive: true, force: true });
stash();
try {
  execSync('next build', {
    stdio: 'inherit',
    env: { ...process.env, NATIVE_EXPORT: '1' },
  });
  console.log('\n✓ Static bundle written to out/.');
  console.log('  Next: npx cap sync  →  npx cap open ios | android');
} finally {
  restore();
  console.log('✓ Restored server routes (/api, /e).');
}
