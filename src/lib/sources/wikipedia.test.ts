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

describe('isWorthSightseeing — administrative areas', () => {
  it('drops the admin districts that were crowding out real Rome landmarks', () => {
    // A trip briefing for Rome opened with these before any actual sight;
    // Wikipedia geotags them at the city centre so they always rank first.
    expect(isWorthSightseeing('Municipio I')).toBe(false);
    expect(isWorthSightseeing('Municipio XII')).toBe(false);
    expect(isWorthSightseeing('Metropolitan City of Rome Capital')).toBe(false);
  });

  it('drops admin areas in other languages too', () => {
    expect(isWorthSightseeing('Comune di Fiesole')).toBe(false);
    expect(isWorthSightseeing('9th arrondissement of Paris')).toBe(false);
    expect(isWorthSightseeing('Distrito de Chamberí')).toBe(false);
    expect(isWorthSightseeing('Stadtbezirk Mitte')).toBe(false);
  });

  it('still keeps the actual sights', () => {
    expect(isWorthSightseeing('Capitoline Museums')).toBe(true);
    expect(isWorthSightseeing('Medusa (Bernini)')).toBe(true);
    expect(isWorthSightseeing('Pantheon, Rome')).toBe(true);
    expect(isWorthSightseeing('Sagrada Família')).toBe(true);
    expect(isWorthSightseeing('Els Quatre Gats')).toBe(true);
  });
});

describe('isWorthSightseeing — historical events are not places', () => {
  it('drops year-prefixed and year-suffixed articles', () => {
    expect(isWorthSightseeing('1932 UCI Road World Championships')).toBe(false);
    expect(isWorthSightseeing('Fall of Rome (1849)')).toBe(false);
    expect(isWorthSightseeing('2006 Winter Olympics')).toBe(false);
  });
  it('does not drop a real place that merely contains a number', () => {
    expect(isWorthSightseeing('Museum of the 20th Century')).toBe(true);
    expect(isWorthSightseeing('Terminal 2')).toBe(true);
    expect(isWorthSightseeing('Piazza del Campidoglio')).toBe(true);
  });
});

describe('isWorthSightseeing — historical entities are not places either', () => {
  it('drops polities and episodes Wikipedia geotags in a city', () => {
    expect(isWorthSightseeing('Principality of Catalonia')).toBe(false);
    expect(isWorthSightseeing('¡Cu-Cut! incident')).toBe(false);
    expect(isWorthSightseeing('Kingdom of Bohemia')).toBe(false);
  });
  it('keeps real places whose names survive the filter', () => {
    expect(isWorthSightseeing('Gothic Quarter, Barcelona')).toBe(true);
    expect(isWorthSightseeing('Palace of the Generalitat of Catalonia')).toBe(true);
    expect(isWorthSightseeing('Plaça Sant Jaume')).toBe(true);
    expect(isWorthSightseeing('Arch of Nero')).toBe(true);
  });
});
