import { describe, it, expect } from 'vitest';
import { parseEventfrogList, tilesForCategory, inEventfrogArea } from './eventfrog';

// Two tiles exactly as eventfrog.at serves them (2026-11-12), plus a series.
const LIST = `
  <a href="/de/p/gruppen/b-arbie-in-not-7477049259193274075.html" name="anchor-1" class="event-list__events__tile">
    <div class="event-list__events__tile__image"><img src="https://res.eventfrog.net/a.webp" alt="x" /></div>
    <span class="event-list__events__tile__content__infos__title">B.ARBIE in Not</span>
  </a>
  <a href="/de/p/konzerte/gospel/gospelshow-guntramsdorf-2026-guntramsdorf-7403823485380779532.html"  class="event-list__events__tile">
    <div class="event-list__events__tile__image"><img src="https://res.eventfrog.net/gospel.webp" alt="x" /></div>
    <span class="event-list__events__tile__content__infos__title">GOSPELSHOW GUNTRAMSDORF 2026</span>
  </a>
  <a href="/de/p/partys/afterwork/ingenieur-innen-ohne-grenzen-kann-will-wien-7508956310177634811.html" class="event-list__events__tile">
    <span class="event-list__events__tile__content__infos__title">Ingenieur:innen ohne Grenzen Kann&amp;Will!</span>
  </a>`;

describe('parseEventfrogList', () => {
  const tiles = parseEventfrogList(LIST);

  it('reads single events and skips dateless series', () => {
    expect(tiles.map(t => t.id)).toEqual(['7403823485380779532', '7508956310177634811']);
  });

  it('keeps the page URL, title, image and eventfrog category', () => {
    expect(tiles[0]).toEqual({
      url: 'https://eventfrog.at/de/p/konzerte/gospel/gospelshow-guntramsdorf-2026-guntramsdorf-7403823485380779532.html',
      id: '7403823485380779532',
      title: 'GOSPELSHOW GUNTRAMSDORF 2026',
      image: 'https://res.eventfrog.net/gospel.webp',
      category: 'konzerte',
    });
    expect(tiles[1].title).toBe('Ingenieur:innen ohne Grenzen Kann&Will!');
    expect(tiles[1].image).toBeUndefined();
  });

  it('never returns the same event twice', () => {
    expect(parseEventfrogList(LIST + LIST)).toHaveLength(2);
  });
});

describe('tilesForCategory', () => {
  const tiles = parseEventfrogList(LIST);
  it('broad buckets take everything; a specific tab only its own kind', () => {
    expect(tilesForCategory(tiles, 'events')).toHaveLength(2);
    expect(tilesForCategory(tiles, 'discover')).toHaveLength(2);
    expect(tilesForCategory(tiles, 'music').map(t => t.category)).toEqual(['konzerte']);
    expect(tilesForCategory(tiles, 'sports')).toHaveLength(0);
  });
});

describe('inEventfrogArea', () => {
  it('covers Austria, Switzerland and Germany — not Milan, not New York', () => {
    expect(inEventfrogArea(48.006, 16.234)).toBe(true);   // Baden
    expect(inEventfrogArea(47.3769, 8.5417)).toBe(true);  // Zürich
    expect(inEventfrogArea(52.52, 13.405)).toBe(true);    // Berlin
    expect(inEventfrogArea(45.4642, 9.19)).toBe(false);   // Milan (measured: 0 tiles)
    expect(inEventfrogArea(40.71, -74.0)).toBe(false);
    expect(inEventfrogArea(NaN, 16)).toBe(false);
  });
});
