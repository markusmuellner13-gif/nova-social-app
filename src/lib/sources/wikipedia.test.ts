import { describe, it, expect } from 'vitest';
import { isWorthSightseeing, isSettlementArticle } from './wikipedia';

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

  it('drops administrative-area articles', () => {
    expect(isWorthSightseeing('Baden District, Austria')).toBe(false);
    expect(isWorthSightseeing('Province of Milan')).toBe(false);
    expect(isWorthSightseeing('Vienna municipality')).toBe(false);
  });

  it("drops the article about the town/district itself", () => {
    expect(isWorthSightseeing('Baden bei Wien', 'Baden')).toBe(false);
    expect(isWorthSightseeing('Baden, Lower Austria', 'Baden')).toBe(false);
    expect(isWorthSightseeing('Baden', 'Baden')).toBe(false);
  });

  it('still keeps a real venue that merely starts with the city name', () => {
    expect(isWorthSightseeing('Baden Casino', 'Baden')).toBe(true);
    expect(isWorthSightseeing('Beethoven-Haus Baden, Baden', 'Baden')).toBe(true);
  });
});

describe('isSettlementArticle', () => {
  it('flags articles that are really about a populated place', () => {
    expect(isSettlementArticle('A municipality in Lower Austria')).toBe(true);
    expect(isSettlementArticle('village in the district of Baden')).toBe(true);
    expect(isSettlementArticle('a town in Italy')).toBe(true);
  });

  it('keeps real sights even when their place is mentioned', () => {
    expect(isSettlementArticle('a castle in the town of Baden')).toBe(false);
    expect(isSettlementArticle('Baroque church in a village near Vienna')).toBe(false);
    expect(isSettlementArticle('19th-century museum')).toBe(false);
  });

  it('is safe on empty/unknown descriptions', () => {
    expect(isSettlementArticle('')).toBe(false);
    expect(isSettlementArticle(null)).toBe(false);
    expect(isSettlementArticle(undefined)).toBe(false);
  });
});
