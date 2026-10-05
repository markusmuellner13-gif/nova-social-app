// Re-colours a MapLibre VECTOR style for the navigation themes.
//
// The nav map used to be CARTO raster tiles, tinted on the GPU with raster
// paint properties. CARTO now answers every keyless tile request with an
// "API KEY REQUIRED" placeholder image, so the map moved to OpenFreeMap's
// vector tiles (free, keyless, commercial use allowed). Vector layers have no
// raster-saturation / hue-rotate, so the same four knobs are applied here to
// every colour in the style instead — once per theme change, never per frame.

export interface ColorTint {
  /** -1..1, like raster-saturation */
  saturation: number;
  /** -1..1, like raster-contrast */
  contrast: number;
  /** degrees, like raster-hue-rotate */
  hueRotate: number;
  /** 0..1 lightness ceiling, like raster-brightness-max */
  brightness: number;
}

interface Hsla { h: number; s: number; l: number; a: number }

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function rgbToHsl(r: number, g: number, b: number, a: number): Hsla {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l, a };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l, a };
}

/** Parse the CSS colour forms map styles use. Returns null for anything else. */
export function parseColor(input: string): Hsla | null {
  const c = input.trim().toLowerCase();
  let m = c.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map(ch => ch + ch).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
    return rgbToHsl(n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1);
  }
  m = c.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return rgbToHsl(+m[1], +m[2], +m[3], a);
  }
  m = c.match(/^hsla?\(\s*([\d.-]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { h: +m[1], s: +m[2] / 100, l: +m[3] / 100, a };
  }
  return null;
}

/** Apply a theme tint to one colour string. Non-colours come back unchanged. */
export function tintColor(color: string, t: ColorTint): string {
  const c = parseColor(color);
  if (!c) return color;
  const h = (((c.h + t.hueRotate) % 360) + 360) % 360;
  const s = clamp01(c.s * (1 + t.saturation));
  const l = clamp01(((c.l - 0.5) * (1 + t.contrast) + 0.5) * t.brightness);
  const r = (n: number) => Math.round(n * 10) / 10;
  return `hsla(${r(h)}, ${r(s * 100)}%, ${r(l * 100)}%, ${Math.round(c.a * 1000) / 1000})`;
}

/**
 * Tint every colour inside a paint value, including the colour stops of
 * `interpolate` / `step` / `match` expressions. Only strings that parse as a
 * colour are touched, so property names and operators pass straight through.
 */
export function tintDeep<T>(value: T, t: ColorTint): T {
  if (typeof value === 'string') return tintColor(value, t) as unknown as T;
  if (Array.isArray(value)) return value.map(v => tintDeep(v, t)) as unknown as T;
  return value;
}

/** The paint properties that hold colours, per vector layer type. */
export const COLOR_PAINT_PROPS: Record<string, string[]> = {
  background: ['background-color'],
  fill: ['fill-color', 'fill-outline-color'],
  line: ['line-color'],
  'fill-extrusion': ['fill-extrusion-color'],
  symbol: ['text-color', 'text-halo-color', 'icon-color'],
  circle: ['circle-color', 'circle-stroke-color'],
};

// ── Whole-palette themes ─────────────────────────────────────────────────────
// A tint can shift a style's colours but can't make it read as a different
// world. A palette replaces the ground colours outright, matched on the
// OpenMapTiles layer ids every OpenFreeMap style shares. Labels keep the tint
// path so they stay legible. First match wins, so specific rules come first.

type PaletteRule = [RegExp, string];

const PALETTES: Record<string, PaletteRule[]> = {
  // Blocks: grass ground, oak-leaf woods, Minecraft water, stone buildings,
  // oak-plank streets edged in dark oak, cobblestone rail.
  minecraft: [
    [/^building-3d$/, '#7a7a7a'],
    [/^building/, '#8f8f8f'],
    [/water/, '#3f76e4'],
    [/rail/, '#5c5c5c'],
    [/casing/, '#5e4426'],
    [/^(road|bridge|tunnel)_(motorway|trunk)/, '#c9a46a'],
    [/^(road|bridge|tunnel)_/, '#b8945f'],
    [/^aeroway/, '#9c9c9c'],
    [/wood/, '#3d6b23'],
    [/sand/, '#dbd3a0'],
    [/ice/, '#a5c3f5'],
    [/^(park|landcover_grass|landuse_pitch|landuse_cemetery|landcover_wetland)/, '#5b8c32'],
    [/^boundary/, '#4a3520'],
    [/^(background|landuse_)/, '#79b956'],
  ],
};

/** The palette colour for one ground layer, or undefined to fall back to the tint. */
export function paletteColor(palette: string | undefined, layerId: string, layerType: string): string | undefined {
  if (!palette || layerType === 'symbol') return undefined;
  const rules = PALETTES[palette];
  if (!rules) return undefined;
  for (const [re, color] of rules) if (re.test(layerId)) return color;
  return undefined;
}
