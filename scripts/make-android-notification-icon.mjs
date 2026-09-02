#!/usr/bin/env node
/**
 * Android status-bar notification icon (`ic_stat_icon`).
 *
 * Android 5+ ignores the colours of a notification's small icon: it takes the
 * ALPHA CHANNEL ONLY and paints it white. Handing it the full-colour app icon
 * therefore produces a solid white square — the single most obvious "this was
 * wrapped, not built" tell in the status bar. So this draws the pin as a white
 * silhouette on transparency, with the sparkle punched out of it.
 *
 * The 24dp icon is generated at each density Android expects.
 *
 *   node scripts/make-android-notification-icon.mjs
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

// The pin and sparkle paths from public/icon.svg, on a transparent ground. The
// sparkle uses the even-odd fill of a second subpath so it reads as a hole
// rather than a lighter shape — at 24dp there is no "lighter", only on or off.
const SILHOUETTE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <path fill-rule="evenodd" fill="#ffffff" d="
    M 512 195
    C 388 195 285 298 285 422
    C 285 530 355 618 448 685
    L 512 800
    L 576 685
    C 669 618 739 530 739 422
    C 739 298 636 195 512 195
    Z
    M 512 318
    C 512 378 574 434 638 434
    C 574 434 512 490 512 550
    C 512 490 450 434 386 434
    C 450 434 512 378 512 318
    Z
  "/>
</svg>`;

// 24dp at each density bucket.
const DENSITIES = {
  'drawable-mdpi':    24,
  'drawable-hdpi':    36,
  'drawable-xhdpi':   48,
  'drawable-xxhdpi':  72,
  'drawable-xxxhdpi': 96,
};

const RES = join('android', 'app', 'src', 'main', 'res');

for (const [dir, size] of Object.entries(DENSITIES)) {
  const out = join(RES, dir);
  mkdirSync(out, { recursive: true });
  // ~10% padding: Android crops the small icon slightly, and a pin that touches
  // the edge gets its point clipped.
  const inner = Math.round(size * 0.82);
  const pad = Math.round((size - inner) / 2);
  await sharp(Buffer.from(SILHOUETTE), { density: 512 })
    .resize(inner, inner)
    .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad,
              background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(out, 'ic_stat_icon.png'));
  console.log(`✓ ${dir}/ic_stat_icon.png  ${size}×${size}`);
}
