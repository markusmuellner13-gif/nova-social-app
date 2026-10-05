import { describe, it, expect } from 'vitest';
import { parseColor, tintColor, tintDeep, paletteColor } from './mapTheme';

const NEUTRAL = { saturation: 0, contrast: 0, hueRotate: 0, brightness: 1 };

describe('parseColor', () => {
  it('reads the colour forms map styles use', () => {
    expect(parseColor('#fff')).toMatchObject({ l: 1, a: 1 });
    expect(parseColor('#ff000080')?.a).toBeCloseTo(0.5, 1);
    expect(parseColor('rgba(0, 0, 255, 0.4)')).toMatchObject({ h: 240, a: 0.4 });
    expect(parseColor('hsl(120, 50%, 25%)')).toMatchObject({ h: 120, s: 0.5, l: 0.25 });
    expect(parseColor('hsla(30,20%,40%,0.7)')?.a).toBeCloseTo(0.7);
  });

  it('refuses non-colours', () => {
    expect(parseColor('interpolate')).toBeNull();
    expect(parseColor('name:latin')).toBeNull();
  });
});

describe('tintColor', () => {
  it('is an identity for the neutral tint', () => {
    expect(tintColor('hsl(120, 50%, 25%)', NEUTRAL)).toBe('hsla(120, 50%, 25%, 1)');
  });

  it('rotates hue and boosts saturation', () => {
    const out = parseColor(tintColor('hsl(10, 40%, 50%)', { ...NEUTRAL, hueRotate: 150, saturation: 0.5 }))!;
    expect(out.h).toBeCloseTo(160);
    expect(out.s).toBeCloseTo(0.6);
  });

  it('caps lightness with the brightness ceiling', () => {
    expect(parseColor(tintColor('#ffffff', { ...NEUTRAL, brightness: 0.8 }))!.l).toBeCloseTo(0.8);
  });

  it('leaves non-colours alone', () => {
    expect(tintColor('zoom', NEUTRAL)).toBe('zoom');
  });
});

describe('tintDeep', () => {
  it('tints colour stops inside expressions without touching operators', () => {
    const expr = ['interpolate', ['linear'], ['zoom'], 5, '#000000', 10, 'rgb(255,255,255)'];
    const out = tintDeep(expr, { ...NEUTRAL, brightness: 0.5 }) as unknown[];
    expect(out[0]).toBe('interpolate');
    expect(out[1]).toEqual(['linear']);
    expect(out[3]).toBe(5);
    expect(parseColor(out[6] as string)!.l).toBeCloseTo(0.5);
  });
});

describe('paletteColor', () => {
  it('paints Minecraft blocks onto the ground layers', () => {
    expect(paletteColor('minecraft', 'water', 'fill')).toBe('#3f76e4');
    expect(paletteColor('minecraft', 'road_minor_casing', 'line')).toBe('#5e4426');
    expect(paletteColor('minecraft', 'road_minor', 'line')).toBe('#b8945f');
    expect(paletteColor('minecraft', 'background', 'background')).toBe('#79b956');
  });

  it('never repaints labels, and is off without a palette', () => {
    expect(paletteColor('minecraft', 'water_name', 'symbol')).toBeUndefined();
    expect(paletteColor(undefined, 'water', 'fill')).toBeUndefined();
  });
});
