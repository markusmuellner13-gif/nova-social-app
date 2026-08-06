// ─────────────────────────────────────────────────────────────────────────────
// Canonical city names.
//
// `events.city` is derived from whatever a source called the place — usually the
// last comma-separated segment of an address. Sources disagree: OSM and German
// publishers say "Wien", Ticketmaster says "Vienna". Both got stored, so the same
// city existed as two rows: Vienna 314 events, Wien 107. A user whose locale or
// geocoder produced one name saw only that slice of the corpus, and the feed for
// a supposedly well-covered city was a third smaller than it should be.
//
// This maps endonyms (and common accented spellings) onto one canonical exonym
// so every writer lands in the same bucket. It is deliberately a small explicit
// list rather than a clever algorithm: "Wien" → "Vienna" is not derivable, and a
// fuzzy matcher would eventually merge two genuinely different towns, which is
// far worse than missing one alias.
// ─────────────────────────────────────────────────────────────────────────────

// Written as lowercase, accent-stripped keys — see `fold()`.
const ALIASES: Record<string, string> = {
  // German-speaking
  wien: 'Vienna',
  muenchen: 'Munich',
  munchen: 'Munich',
  koeln: 'Cologne',
  koln: 'Cologne',
  nuernberg: 'Nuremberg',
  nurnberg: 'Nuremberg',
  zuerich: 'Zurich',
  zurich: 'Zurich',
  genf: 'Geneva',
  basel: 'Basel',
  salzburg: 'Salzburg',
  graz: 'Graz',
  // Italian
  roma: 'Rome',
  milano: 'Milan',
  firenze: 'Florence',
  venezia: 'Venice',
  napoli: 'Naples',
  torino: 'Turin',
  genova: 'Genoa',
  padova: 'Padua',
  // Iberian
  lisboa: 'Lisbon',
  sevilla: 'Seville',
  zaragoza: 'Zaragoza',
  'a coruna': 'A Coruña',
  // French / Benelux
  bruxelles: 'Brussels',
  brussel: 'Brussels',
  anvers: 'Antwerp',
  antwerpen: 'Antwerp',
  gent: 'Ghent',
  'den haag': 'The Hague',
  "s-gravenhage": 'The Hague',
  // Nordic / Baltic
  kobenhavn: 'Copenhagen',
  koebenhavn: 'Copenhagen',
  goteborg: 'Gothenburg',
  goeteborg: 'Gothenburg',
  helsingfors: 'Helsinki',
  // Central / Eastern Europe
  praha: 'Prague',
  warszawa: 'Warsaw',
  krakow: 'Kraków',
  wroclaw: 'Wrocław',
  bratislava: 'Bratislava',
  budapest: 'Budapest',
  bukarest: 'Bucharest',
  bucuresti: 'Bucharest',
  beograd: 'Belgrade',
  // Greece / Turkey
  athina: 'Athens',
  athinai: 'Athens',
  istanbul: 'Istanbul',
  // Further afield
  moskva: 'Moscow',
  lisbona: 'Lisbon',
  tokio: 'Tokyo',
  osaka: 'Osaka',
  seoul: 'Seoul',
};

// Letters that NFD does NOT decompose, because they are distinct letters rather
// than a base + combining mark. Caught by a failing test on "København": NFD
// leaves the ø alone, so it folded to "københavn" and never matched the alias.
// ß is the same trap (it bit the username sanitiser and the feed's title deduper
// too); the Nordic and Central-European ones are just as common in city names.
const NON_DECOMPOSING: [RegExp, string][] = [
  [/ß/g, 'ss'],
  [/ø/g, 'o'], [/æ/g, 'ae'], [/å/g, 'aa'],
  [/đ/g, 'd'], [/ð/g, 'd'], [/þ/g, 'th'],
  [/ł/g, 'l'], [/ı/g, 'i'], [/œ/g, 'oe'],
];

/**
 * Lowercase + strip diacritics, so "Kraków", "Krakow" and "KRAKÓW" all agree.
 */
function fold(s: string): string {
  let out = s.toLowerCase();
  for (const [re, to] of NON_DECOMPOSING) out = out.replace(re, to);
  return out
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Canonical display name for a city, or null for input that isn't usable.
 *
 * Unknown names are returned trimmed and otherwise untouched — we only rewrite
 * names we have explicitly decided about. Silently "correcting" everything else
 * is how you end up merging two real places.
 */
export function canonicalCity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  // Guard against an address fragment or a postcode arriving as "the city".
  if (trimmed.length > 60) return null;

  const key = fold(trimmed);
  if (!key) return null;

  const mapped = ALIASES[key];
  if (mapped) return mapped;

  // Strip a leading article some sources emit ("Den Haag" handled above; this
  // catches "The Hague" style input arriving already-canonical).
  return trimmed;
}

/** Do two city names refer to the same place? */
export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = canonicalCity(a);
  const cb = canonicalCity(b);
  if (!ca || !cb) return false;
  return fold(ca) === fold(cb);
}
