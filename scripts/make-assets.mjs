#!/usr/bin/env node
/**
 * Generate the two source images @capacitor/assets expands into every iOS and
 * Android icon and splash size.
 *
 * Both are rendered from public/icon.svg rather than upscaled from the 512px
 * PNG, so the 1024px App Store icon is genuinely sharp — Apple rejects blurry
 * or artefacted icons, and an upscale is exactly what that looks like.
 *
 *   node scripts/make-assets.mjs && npm run cap:assets
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BG = '#0a0a0f';   // the app's own background, matching capacitor.config.ts
mkdirSync('assets', { recursive: true });
const svg = readFileSync('public/icon.svg').toString();

// The source SVG rounds its own corners (rx=230) because it doubles as the web
// favicon. An app icon must NOT: iOS masks it to a squircle and Android crops it
// to a circle, so baked-in corners leave dark wedges inside the OS mask. Square
// the artwork off and let each platform apply its own shape.
const fullBleed = svg.replace(/rx="230" ry="230"/, 'rx="0" ry="0"');

// ── Icon: 1024×1024, fully opaque (iOS forbids alpha in the marketing icon).
await sharp(Buffer.from(fullBleed), { density: 384 })
  .resize(1024, 1024, { fit: 'contain', background: BG })
  .flatten({ background: BG })
  .png()
  .toFile('assets/icon.png');

// ── Splash: 2732×2732, logo centred on the app background. Square and oversized
// on purpose — it is centre-cropped to every device aspect ratio, so the mark
// has to survive being cut on all four sides.
const logo = await sharp(Buffer.from(svg), { density: 384 }).resize(620, 620).png().toBuffer();
const splash = await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: BG },
})
  .composite([{ input: logo, gravity: 'centre' }])
  .png()
  .toBuffer();

writeFileSync('assets/splash.png', splash);
// Nova's UI is dark in both themes, so the dark-mode splash is the same artwork.
// Omitting it would make dark-mode devices flash a white screen before a dark app.
writeFileSync('assets/splash-dark.png', splash);

for (const f of ['assets/icon.png', 'assets/splash.png', 'assets/splash-dark.png']) {
  const m = await sharp(f).metadata();
  console.log(`✓ ${f}  ${m.width}×${m.height}`);
}
