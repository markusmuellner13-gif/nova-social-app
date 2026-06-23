import { describe, it, expect } from 'vitest';
import { isWorthSightseeing } from './wikipedia';

describe('isWorthSightseeing', () => {
  it('drops generic train stations and transit infrastructure', () => {
    expect(isWorthSightseeing('Pfaffstätten railway station')).toBe(false);
    expect(isWorthSightseeing('Bahnhof Pfaffstätten')).toBe(false);
    expect(isWorthSightseeing('Baden bus station')).toBe(false);
    expect(isWorthSightseeing('A2 motorway junction')).toBe(false);
    expect(isWorthSightseeing('Vienna electrical substation')).toBe(false);
    expect(isWorthSightseeing('List of churches in Baden')).toBe(false);
  });

  it('keeps real landmarks and sights', () => {
    expect(isWorthSightseeing('Beethoven House')).toBe(true);
    expect(isWorthSightseeing('St. Stephen\'s Cathedral')).toBe(true);
    expect(isWorthSightseeing('Schloss Schönbrunn')).toBe(true);
    expect(isWorthSightseeing('Rollett Museum')).toBe(true);
  });

  it('keeps world-famous stations that are genuine sights', () => {
    expect(isWorthSightseeing('Grand Central Terminal')).toBe(true);
    expect(isWorthSightseeing('Antwerpen-Centraal railway station')).toBe(true);
    expect(isWorthSightseeing('St Pancras railway station')).toBe(true);
  });
});
