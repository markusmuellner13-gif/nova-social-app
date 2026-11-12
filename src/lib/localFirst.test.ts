import { describe, it, expect } from 'vitest';
import {
  townOfLabel, isInUserCity, splitLocal, byDistance, cityCoreKm, cityFetchRadiusKm, isMetro, TOWN_CORE_KM,
} from './localFirst';

// The user standing in Baden bei Wien (a town: the geocoder gives it 16 km).
const BADEN = { city: 'Baden', lat: 48.006, lng: 16.234, localKm: 16 };
const VIENNA = { city: 'Vienna', lat: 48.2082, lng: 16.3738, localKm: 22 };

const at = (name: string, lat: number, lng: number, distanceKm?: number) => ({ location: { name, lat, lng }, distanceKm });

describe('townOfLabel', () => {
  it('reads the town from "Venue, Town"', () => {
    expect(townOfLabel('Stalltheater, Königstetten')).toBe('Königstetten');
    expect(townOfLabel('Casino Baden, Baden')).toBe('Baden');
  });

  it('skips postcodes, country and region suffixes', () => {
    expect(townOfLabel('Theater, 2500 Baden, Austria')).toBe('Baden');
    expect(townOfLabel('Halle, Mödling, Niederösterreich')).toBe('Mödling');
    expect(townOfLabel('Henry\'s Bar, Baden (CH)')).toBe('Baden');
  });

  it('says nothing for a single-part label — it may be a venue, not a town', () => {
    expect(townOfLabel("Ling's Kitchen")).toBeNull();
    expect(townOfLabel('Hinterbrühl')).toBeNull();
    expect(townOfLabel('')).toBeNull();
    expect(townOfLabel(undefined)).toBeNull();
  });

  it('never mistakes a street address for a town', () => {
    expect(townOfLabel('Porgy & Bess, Riemergasse 11')).toBeNull();
  });
});

describe('isInUserCity — Baden bei Wien, measured cases from production', () => {
  it('keeps Baden\'s own venues', () => {
    expect(isInUserCity(at('Kebab&Pizza House, Baden', 48.007, 16.235, 0.1), BADEN)).toBe(true);
    expect(isInUserCity(at("Ling's Kitchen, Baden", 48.01, 16.24, 0.6), BADEN)).toBe(true);
  });

  it('a "Baden" label 9 km out (OSM labels with the SEARCHED town) is a neighbour', () => {
    expect(isInUserCity(at('Hexensitz, Baden', 48.0, 16.1, 9.3), BADEN)).toBe(false);
  });

  it('Mödling\'s sights are Mödling\'s, not Baden\'s', () => {
    expect(isInUserCity(at('Burgruine Mödling, Mödling', 48.08, 16.27, 8.5), BADEN)).toBe(false);
  });

  it('Bad Vöslau — the nearest other town, 4.6 km — is a neighbour', () => {
    expect(isInUserCity(at('Thermalbad, Bad Vöslau', 47.966, 16.217, 4.6), BADEN)).toBe(false);
  });

  it('a label naming another town wins over a wrong pin', () => {
    // Bratislava events used to be pinned on Mödling, and Königstetten's theatre
    // sat 1 km from Baden's centre in the database.
    expect(isInUserCity(at('Stalltheater, Königstetten', 48.0107, 16.2448, 1), BADEN)).toBe(false);
    expect(isInUserCity(at('Aupark Mall, Bratislava', 48.0857, 16.2897, 10), BADEN)).toBe(false);
  });

  it('a map place labelled with the SEARCHED town is placed by its pin (production case)', () => {
    // Mödling's 25 km OSM sweep labels Baden's own hotel "…, Mödling".
    const hotel = { id: 'osm_123', ...at('Hotel Eden, Mödling', 48.0072, 16.2320, 0.1) };
    expect(isInUserCity(hotel, BADEN)).toBe(true);
    // …and a Wikipedia landmark really in Mödling is still a neighbour.
    const burg = { id: 'wiki_9', ...at('Burgruine Mödling, Mödling', 48.08, 16.27, 8.5) };
    expect(isInUserCity(burg, BADEN)).toBe(false);
    // An event's label is its venue's own town, so it still wins over a pin.
    const ev = { id: 'eb_1', ...at('Stalltheater, Königstetten', 48.0107, 16.2448, 1) };
    expect(isInUserCity(ev, BADEN)).toBe(false);
  });

  it('without a pin it trusts only a label naming the user\'s town', () => {
    expect(isInUserCity({ location: { name: 'Stadttheater, Baden', lat: 0, lng: 0 } }, BADEN)).toBe(true);
    expect(isInUserCity({ location: { name: 'Somewhere', lat: 0, lng: 0 } }, BADEN)).toBe(false);
  });
});

describe('relabelInTown', () => {
  it('shows the user\'s town on a map place pinned inside it', async () => {
    const { relabelInTown } = await import('./localFirst');
    const hotel = { id: 'osm_1', ...at('Hotel Eden, Mödling', 48.0072, 16.232, 0.1) };
    expect(relabelInTown(hotel, BADEN).location.name).toBe('Hotel Eden, Baden');
  });

  it('never touches an event, a correct label, or a missing user', async () => {
    const { relabelInTown } = await import('./localFirst');
    const ev = { id: 'eb_1', ...at('Stalltheater, Königstetten', 48.01, 16.24, 1) };
    expect(relabelInTown(ev, BADEN)).toBe(ev);
    const ok = { id: 'osm_2', ...at('Casino, Baden', 48.0, 16.23, 0.3) };
    expect(relabelInTown(ok, BADEN)).toBe(ok);
    expect(relabelInTown(ok, null)).toBe(ok);
  });
});

describe('isInUserCity — a metro', () => {
  it('Vienna keeps its districts and its own-language name', () => {
    expect(isInUserCity(at('Metropol, Wien', 48.21, 16.33, 3), VIENNA)).toBe(true);
    expect(isInUserCity(at('Arena, Wien-Donaustadt', 48.23, 16.5, 11), VIENNA)).toBe(true);
    expect(isInUserCity(at('Loop, 1080 Wien', 48.21, 16.34, 2), VIENNA)).toBe(true);
  });

  it('a neighbouring town inside the metro ring is still a neighbour', () => {
    expect(isInUserCity(at('Stift, Klosterneuburg', 48.3, 16.32, 12), VIENNA)).toBe(false);
  });
});

describe('radii', () => {
  it('a town is small, a metro uses its ring', () => {
    expect(isMetro(BADEN)).toBe(false);
    expect(cityCoreKm(BADEN)).toBe(TOWN_CORE_KM);
    expect(isMetro(VIENNA)).toBe(true);
    expect(cityCoreKm(VIENNA)).toBe(22);
  });

  it('asks the server for a whole-km radius a little wider than the core', () => {
    expect(cityFetchRadiusKm(BADEN)).toBe(6);
    expect(Number.isInteger(cityFetchRadiusKm(VIENNA))).toBe(true);
  });
});

describe('splitLocal / byDistance', () => {
  it('splits keeping each side\'s order, and passes everything through without a city', () => {
    const posts = [at('A, Baden', 48.006, 16.234, 0.5), at('B, Mödling', 48.08, 16.28, 9), at('C, Baden', 48.0, 16.23, 1)];
    const [local, away] = splitLocal(posts, BADEN);
    expect(local.map(p => p.location.name)).toEqual(['A, Baden', 'C, Baden']);
    expect(away.map(p => p.location.name)).toEqual(['B, Mödling']);
    expect(splitLocal(posts, null)[0]).toHaveLength(3);
  });

  it('orders nearest first, unplaceable last', () => {
    const posts = [
      { location: { name: 'far', lat: 0, lng: 0 } },
      at('x, Mödling', 48.08, 16.28, 9),
      at('y, Bad Vöslau', 47.97, 16.22, 4.6),
    ];
    expect(byDistance(posts, BADEN).map(p => p.location.name)).toEqual(['y, Bad Vöslau', 'x, Mödling', 'far']);
  });
});
