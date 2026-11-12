// Does a listing's own town mean the town we searched for?
//
// Moved out of sources/webCrawler.ts (unchanged) so the Eventbrite source and
// the app's local-first feed can use the same rule without importing the whole
// crawler — and without a webCrawler ↔ eventbrite import cycle. Pure, no I/O,
// safe in the browser.

const CITY_ALIASES: Record<string, string> = {
  wien: 'vienna', vienna: 'vienna', muenchen: 'munich', munchen: 'munich', munich: 'munich',
  koeln: 'cologne', koln: 'cologne', cologne: 'cologne', praha: 'prague', prague: 'prague',
  roma: 'rome', rome: 'rome', firenze: 'florence', florence: 'florence', venezia: 'venice',
  venice: 'venice', napoli: 'naples', naples: 'naples', milano: 'milan', milan: 'milan',
  torino: 'turin', turin: 'turin', graz: 'graz', linz: 'linz', salzburg: 'salzburg',
  innsbruck: 'innsbruck', berlin: 'berlin', hamburg: 'hamburg', frankfurt: 'frankfurt',
  zurich: 'zurich', zuerich: 'zurich', london: 'london', paris: 'paris', barcelona: 'barcelona',
  madrid: 'madrid', amsterdam: 'amsterdam', budapest: 'budapest', lisbon: 'lisbon',
  lisboa: 'lisbon', dublin: 'dublin',
};

export function foldCity(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a')
    .replace(/[^a-z]/g, '');
}

/**
 * Does this listing's own city plausibly mean the city we searched for?
 *
 * The old check only said "no" for cities in CITY_ALIASES — a hand-written list
 * of ~30 European cities. Every other place on earth was therefore treated as a
 * match, which is how listings from other countries entirely rode a city page
 * into a local feed: nothing recognised the name, so nothing rejected it, and
 * `toApiPost` then stamped the SEARCH city's coordinates on it so the distance
 * validator downstream saw a perfectly local event.
 *
 * Now the default is the other way round: an unrecognised, non-matching city
 * name is a mismatch. Districts and suffixed forms ("Wien-Donaustadt", "Vienna
 * 3rd District") still match, because either name contains the other.
 */
export function sameCityish(venueCity: string, searchCity: string): boolean {
  const rawV = foldCity(venueCity), rawS = foldCity(searchCity);
  if (!rawV || !rawS) return true;               // nothing to compare on

  // Compare on every form each name can legitimately take: the whole string,
  // its alias (Wien→vienna), and each of its own words plus their aliases. That
  // last part is what makes "Wien-Donaustadt" match Vienna — the district
  // suffix hides the alias inside a longer string, where a whole-string lookup
  // never finds it.
  const keys = (s: string): Set<string> => {
    const raw = foldCity(s);
    const out = new Set<string>([raw, CITY_ALIASES[raw] ?? raw]);
    for (const word of s.split(/[^\p{L}]+/u)) {
      const w = foldCity(word);
      if (w.length < 3) continue;                // "3rd", "am", "bei" — noise
      out.add(w);
      const alias = CITY_ALIASES[w];
      if (alias) out.add(alias);
    }
    return out;
  };

  const kv = keys(venueCity), ks = keys(searchCity);
  for (const v of kv) if (ks.has(v)) return true;
  return rawV.includes(rawS) || rawS.includes(rawV);
}
