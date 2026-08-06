import { describe, it, expect } from 'vitest';
import { canonicalCity, sameCity } from './cityName';

describe('canonicalCity', () => {
  it('merges the split that caused this: Wien -> Vienna', () => {
    // Production had Vienna 314 events and Wien 107 as separate cities.
    expect(canonicalCity('Wien')).toBe('Vienna');
    expect(canonicalCity('Vienna')).toBe('Vienna');
    expect(sameCity('Wien', 'Vienna')).toBe(true);
  });

  it('handles the other endonyms in the ingest list', () => {
    expect(canonicalCity('Roma')).toBe('Rome');
    expect(canonicalCity('Milano')).toBe('Milan');
    expect(canonicalCity('Firenze')).toBe('Florence');
    expect(canonicalCity('Praha')).toBe('Prague');
    expect(canonicalCity('Warszawa')).toBe('Warsaw');
    expect(canonicalCity('Lisboa')).toBe('Lisbon');
    expect(canonicalCity('Bruxelles')).toBe('Brussels');
    expect(canonicalCity('København')).toBe('Copenhagen');
  });

  it('is case- and accent-insensitive', () => {
    expect(canonicalCity('WIEN')).toBe('Vienna');
    expect(canonicalCity('  wien  ')).toBe('Vienna');
    expect(canonicalCity('Zürich')).toBe('Zurich');
    expect(canonicalCity('München')).toBe('Munich');
    expect(canonicalCity('Köln')).toBe('Cologne');
  });

  it('handles ß, which NFD does not decompose', () => {
    // Same trap as the username sanitiser — ß must be mapped explicitly.
    expect(canonicalCity('Gießen')).toBe('Gießen');   // unknown, passed through
    expect(sameCity('Gießen', 'Giessen')).toBe(true); // but folds to the same key
  });

  it('passes unknown cities through untouched rather than guessing', () => {
    // Silently "correcting" everything is how two real places get merged.
    expect(canonicalCity('Wiener Neustadt')).toBe('Wiener Neustadt');
    expect(canonicalCity('Klagenfurt')).toBe('Klagenfurt');
    expect(sameCity('Wien', 'Wiener Neustadt')).toBe(false);
  });

  it('collapses whitespace but keeps the real name', () => {
    expect(canonicalCity('New   York')).toBe('New York');
  });

  it('rejects empty, null and address fragments', () => {
    expect(canonicalCity(null)).toBeNull();
    expect(canonicalCity(undefined)).toBeNull();
    expect(canonicalCity('')).toBeNull();
    expect(canonicalCity('   ')).toBeNull();
    expect(canonicalCity('x'.repeat(61))).toBeNull(); // not a city name
  });

  it('sameCity is false when either side is unusable', () => {
    expect(sameCity('Vienna', null)).toBe(false);
    expect(sameCity(null, null)).toBe(false);
  });
});
