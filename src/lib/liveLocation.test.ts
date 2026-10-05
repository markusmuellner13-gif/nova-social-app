import { describe, it, expect } from 'vitest';
import {
  decideLiveUpdate, metresBetween, coarse, restampDistances,
  COMMIT_MIN_M, REGEOCODE_MIN_INTERVAL_MS,
} from './liveLocation';

// Stephansplatz, Vienna, and points offset north by a given number of metres.
const BASE = { lat: 48.2085, lng: 16.3721 };
const north = (m: number, accuracy?: number) => ({ lat: BASE.lat + m / 111_320, lng: BASE.lng, accuracy });

describe('metresBetween', () => {
  it('measures a known offset within a metre', () => {
    expect(Math.abs(metresBetween(BASE, north(500)) - 500)).toBeLessThan(1);
  });
});

describe('decideLiveUpdate', () => {
  const t0 = 1_000_000;

  it('commits and geocodes the very first fix', () => {
    expect(decideLiveUpdate(north(0, 30), null, null, t0)).toEqual({ commit: true, regeocode: true });
  });

  it('ignores GPS jitter below the commit threshold', () => {
    const d = decideLiveUpdate(north(COMMIT_MIN_M - 20, 30), north(0, 30), { at: t0, point: north(0) }, t0 + 5_000);
    expect(d).toEqual({ commit: false, regeocode: false });
  });

  it('commits a real move but keeps the place name for a short walk', () => {
    const d = decideLiveUpdate(north(200, 30), north(0, 30), { at: t0, point: north(0) }, t0 + 120_000);
    expect(d).toEqual({ commit: true, regeocode: false });
  });

  it('re-geocodes after moving far enough', () => {
    const d = decideLiveUpdate(north(800, 30), north(0, 30), { at: t0, point: north(0) }, t0 + 120_000);
    expect(d).toEqual({ commit: true, regeocode: true });
  });

  it('never geocodes more than once a minute, even in a fast car or train', () => {
    const d = decideLiveUpdate(north(3_000, 30), north(0, 30), { at: t0, point: north(0) }, t0 + REGEOCODE_MIN_INTERVAL_MS - 1);
    expect(d).toEqual({ commit: true, regeocode: false });
  });

  it('takes a much sharper fix of the same spot', () => {
    const d = decideLiveUpdate(north(10, 15), north(0, 900), { at: t0, point: north(0) }, t0 + 5_000);
    expect(d.commit).toBe(true);
  });

  it('drops fixes too vague to place the user', () => {
    expect(decideLiveUpdate(north(5_000, 5_000), north(0, 30), null, t0)).toEqual({ commit: false, regeocode: false });
  });

  it('drops non-finite coordinates', () => {
    expect(decideLiveUpdate({ lat: NaN, lng: 1 }, null, null, t0).commit).toBe(false);
  });
});

describe('coarse', () => {
  it('rounds to about a kilometre so effects ignore small moves', () => {
    expect(coarse(48.20851)).toBe(48.21);
    expect(coarse(undefined)).toBe(0);
  });
});

describe('restampDistances', () => {
  const post = (lat: number, lng: number, distanceKm?: number) => ({ id: 'x', location: { lat, lng }, distanceKm });

  it('measures from the live position', () => {
    const [p] = restampDistances([post(BASE.lat + 1 / 111.32, BASE.lng, 9)], BASE.lat, BASE.lng);
    expect(p.distanceKm).toBeCloseTo(1, 1);
  });

  it('keeps the same array when nothing moved meaningfully', () => {
    const posts = [post(BASE.lat, BASE.lng, 0)];
    expect(restampDistances(posts, BASE.lat, BASE.lng)).toBe(posts);
  });

  it('leaves posts without real coordinates alone', () => {
    const posts = [{ id: 'y', location: { lat: 0, lng: 0 }, distanceKm: 3 }];
    expect(restampDistances(posts, BASE.lat, BASE.lng)).toBe(posts);
  });

  it('does nothing without a user position', () => {
    const posts = [post(1, 1, 2)];
    expect(restampDistances(posts, undefined, undefined)).toBe(posts);
  });
});
