import { describe, it, expect } from 'vitest';
import { mergeTowns, townSlug } from './towns';

const VIENNA = { city: 'Vienna', country: 'Austria', lat: 48.2082, lng: 16.3738 };
const BADEN = { city: 'Baden', country: 'Austria', lat: 48.0059, lng: 16.2342 };

describe('mergeTowns', () => {
  it('adds a town people open that the sweep did not know', () => {
    const voeslau = { city: 'Bad Vöslau', country: 'Austria', lat: 47.97, lng: 16.21 };
    expect(mergeTowns([VIENNA, BADEN], [voeslau]).map(t => t.city)).toEqual(['Vienna', 'Baden', 'Bad Vöslau']);
  });

  it('does not add a place already covered (another district of Vienna, Baden again)', () => {
    const fromFloridsdorf = { city: 'Wien', country: 'Österreich', lat: 48.21, lng: 16.38 };
    const badenAgain = { city: 'Baden', country: 'Austria', lat: 48.01, lng: 16.24 };
    expect(mergeTowns([VIENNA, BADEN], [fromFloridsdorf, badenAgain])).toHaveLength(2);
  });

  it('keeps two learned towns apart from each other too', () => {
    const a = { city: 'Traiskirchen', country: 'Austria', lat: 48.02, lng: 16.29 };
    const b = { city: 'Traiskirchen', country: 'Austria', lat: 48.021, lng: 16.291 };
    expect(mergeTowns([], [a, b])).toHaveLength(1);
  });
});

describe('townSlug', () => {
  it('folds case and accents so one town is one counter', () => {
    expect(townSlug('Bad Vöslau', 'Austria')).toBe(townSlug('BAD VOSLAU', 'austria'));
  });
});
