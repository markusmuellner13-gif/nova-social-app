import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svg = readFileSync(join(root, 'public', 'icon.svg'));

const sizes = [
  { file: 'icon-512.png',          size: 512 },
  { file: 'icon-192.png',          size: 192 },
  { file: 'apple-touch-icon.png',  size: 180 },
  { file: 'favicon-32.png',        size: 32  },
];

for (const { file, size } of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(join(root, 'public', file));
  console.log(`✓ ${file} (${size}x${size})`);
}
console.log('All icons generated.');
