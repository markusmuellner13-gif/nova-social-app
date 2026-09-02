#!/usr/bin/env node
/**
 * Google Play listing artwork.
 *
 *   feature-graphic.png  1024×500, no alpha — shown at the top of the store
 *                        listing and in Play's promotional surfaces.
 *
 * Play crops the sides of the feature graphic on some surfaces, so the logo and
 * wordmark sit inside the middle ~70% and nothing meaningful touches an edge.
 *
 *   node scripts/make-store-assets.mjs   →  store/
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'store';
mkdirSync(OUT, { recursive: true });

const W = 1024, H = 500;

// Background: the app's near-black with a soft violet→pink glow behind the mark,
// echoing the icon gradient without competing with the logo for attention.
const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="glow" cx="0.30" cy="0.5" r="0.75">
      <stop offset="0%"   stop-color="#8b5cf6" stop-opacity="0.55"/>
      <stop offset="55%"  stop-color="#ec4899" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#0a0a0f" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0a0a0f"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
</svg>`;

// Text is rendered as its own SVG layer. A generic sans stack keeps this
// reproducible on a machine without the exact font installed.
const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <style>
    .name { font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 96px; font-weight: 800; fill: #ffffff; letter-spacing: -2px; }
    .tag  { font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; font-size: 33px; font-weight: 500; fill: #b9b9c9; }
  </style>
  <text class="name" x="360" y="248">Nova</text>
  <text class="tag"  x="366" y="300">Discover your world</text>
</svg>`;

const logo = await sharp(Buffer.from(readFileSync('public/icon.svg')), { density: 384 })
  .resize(250, 250)
  .png()
  .toBuffer();

const featureGraphic = await sharp(Buffer.from(bg))
  .composite([
    { input: logo, top: Math.round((H - 250) / 2), left: 90 },
    { input: Buffer.from(text), top: 0, left: 0 },
  ])
  // Play rejects transparency in the feature graphic. flatten() composites onto
  // an opaque ground but sharp still WRITES an alpha channel, so removeAlpha()
  // is what actually drops it from the file.
  .flatten({ background: '#0a0a0f' })
  .removeAlpha()
  .png()
  .toBuffer();

writeFileSync(join(OUT, 'feature-graphic.png'), featureGraphic);

const m = await sharp(join(OUT, 'feature-graphic.png')).metadata();
console.log(`✓ ${join(OUT, 'feature-graphic.png')}  ${m.width}×${m.height}  alpha=${m.hasAlpha}`);
