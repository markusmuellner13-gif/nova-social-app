// ─────────────────────────────────────────────────────────────────────────────
// Working out what a site's fields MEAN when nobody told us.
//
// This is the part that lets the engine read a site whose data format it has
// never seen. Two signals, and the order matters:
//
//   1. VALUE SHAPE (primary). Whatever a key is called, if 70% of its values
//      parse as ISO dates, that key is the start date. If they are all numbers
//      in [-90, 90] and a sibling key is in [-180, 180], those are coordinates.
//      Shape is language-independent, which is the whole point: `fecha_inicio`,
//      `開始日` and `f_2` are all read correctly without knowing a word of the
//      site's language, or the key being a word at all.
//
//   2. KEY VOCABULARY (tie-breaker only). A hint table in the languages Nova
//      already serves. It can only CHOOSE BETWEEN candidates that already
//      passed the shape test, never promote one that failed — otherwise a field
//      called `title` holding a UUID would win on its name alone.
//
// Everything is inferred from a SAMPLE OF ROWS, never a single row, so one
// oddly-populated record can't define the schema.
// ─────────────────────────────────────────────────────────────────────────────

import type { FieldName } from './types';
import {
  looksLikeDate, looksLikeUrl, looksLikeImage, looksLikePrice,
  looksLikeLat, looksLikeLng, looksLikeProse, looksLikeName,
} from './validate';

type Row = Record<string, unknown>;

/**
 * Key-name hints, deliberately multilingual. These break ties between keys that
 * already look right by value; they never override the value test.
 */
const KEY_HINTS: Partial<Record<FieldName, RegExp>> = {
  name:        /^(name|title|titel|titre|titolo|titulo|nombre|naam|headline|label|caption|見出し|名前|タイトル)$/i,
  description: /(desc|description|beschreibung|descripcion|descrizione|summary|abstract|about|excerpt|teaser|概要|説明)/i,
  startDate:   /(start|begin|beginn|from|von|desde|inizio|debut|début|fecha|datum|data|date|時|開始|日付)/i,
  endDate:     /(end|ende|until|bis|hasta|fine|fin|expiry|expires|終了)/i,
  url:         /^(url|link|href|permalink|page|slug|detail_?url|website|webseite|sitio|siteweb)$/i,
  ticketUrl:   /(ticket|tickets|booking|book|buy|purchase|order|checkout|kaufen|karten|entradas|billet|biglietti|reserv)/i,
  image:       /(image|img|photo|foto|picture|thumb|thumbnail|cover|hero|media|bild|imagen|immagine|画像|写真)/i,
  venue:       /(venue|place|location|locale|ort|lugar|luogo|lieu|spielort|veranstaltungsort|会場|場所)/i,
  street:      /(street|address|addr|strasse|straße|adresse|direccion|dirección|indirizzo|住所)/i,
  locality:    /(city|town|locality|stadt|ciudad|citta|città|ville|plaats|市|都市)/i,
  region:      /(region|state|province|bundesland|provincia|regione|région|county)/i,
  country:     /(country|land|pais|país|paese|pays|nation|国)/i,
  lat:         /(lat|latitude|breite|latitud|latitudine|緯度)/i,
  lng:         /(lng|lon|long|longitude|laenge|länge|longitud|longitudine|経度)/i,
  price:       /(price|cost|amount|fee|preis|kosten|precio|prezzo|prix|tarif|eintritt|価格|料金)/i,
  currency:    /(currency|waehrung|währung|moneda|valuta|devise|通貨)/i,
  rating:      /(rating|score|stars|bewertung|valoracion|valutazione|note|評価)/i,
  duration:    /(duration|length|dauer|duracion|duración|durata|durée|所要時間)/i,
  openingHours:/(opening|hours|openinghours|oeffnungszeiten|öffnungszeiten|horario|orari|horaires|営業時間)/i,
  organizer:   /(organi[sz]er|promoter|host|veranstalter|organizador|organizzatore|organisateur|supplier|provider|operator)/i,
};

/** The value test each field must pass. Fraction-of-rows based, see below. */
const SHAPE: Record<FieldName, (v: unknown) => boolean> = {
  name:         looksLikeName,
  description:  looksLikeProse,
  startDate:    looksLikeDate,
  endDate:      looksLikeDate,
  url:          looksLikeUrl,
  ticketUrl:    looksLikeUrl,
  image:        looksLikeImage,
  venue:        v => typeof v === 'string' && v.trim().length >= 3 && v.length <= 120 && !looksLikeUrl(v),
  street:       v => typeof v === 'string' && v.trim().length >= 4 && v.length <= 160 && /\d|\p{L}/u.test(v),
  locality:     v => typeof v === 'string' && v.trim().length >= 2 && v.length <= 80 && !/\d{3}/.test(v),
  region:       v => typeof v === 'string' && v.trim().length >= 2 && v.length <= 80,
  country:      v => typeof v === 'string' && v.trim().length >= 2 && v.length <= 60,
  lat:          looksLikeLat,
  lng:          looksLikeLng,
  price:        looksLikePrice,
  currency:     v => typeof v === 'string' && /^[A-Z]{3}$/.test(v.trim()),
  rating:       v => { const n = typeof v === 'string' ? parseFloat(v) : v;
                       return typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 5; },
  duration:     v => typeof v === 'string' && /^(P?T?\d|\d+\s*(min|h|hour|std|stunde|ora|ore|heure))/i.test(v.trim()),
  openingHours: v => typeof v === 'string' && /\d{1,2}[:.]\d{2}/.test(v) && v.length <= 300,
  organizer:    v => typeof v === 'string' && v.trim().length >= 2 && v.length <= 120 && !looksLikeUrl(v),
};

/**
 * Fields where being wrong is cheap and coverage is what matters, versus fields
 * that anchor the whole record. A name that is really an id poisons everything
 * downstream, so `name` has to hold across nearly every row; a price that only
 * appears on half the rows is completely normal.
 */
const MIN_COVERAGE: Partial<Record<FieldName, number>> = {
  name: 0.8, startDate: 0.6, lat: 0.6, lng: 0.6, url: 0.5,
};
const DEFAULT_COVERAGE = 0.4;

/** Flatten one row one level deep, so `location.name` is visible as a key. */
export function flattenRow(row: Row, depth = 2): Row {
  const out: Row = {};
  const visit = (obj: Row, prefix: string, d: number) => {
    for (const [k, v] of Object.entries(obj)) {
      if (Object.keys(out).length > 200) return;
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && d > 0) {
        visit(v as Row, key, d - 1);
      } else if (Array.isArray(v)) {
        // Take the first primitive/object element — image arrays and
        // single-element location arrays are both extremely common.
        const first = v[0];
        if (first && typeof first === 'object' && d > 0) visit(first as Row, key, d - 1);
        else if (first !== undefined) out[key] = first;
      } else {
        out[key] = v;
      }
    }
  };
  visit(row, '', depth);
  return out;
}

/** Every key present across the sample, with the values it carried. */
function columns(rows: Row[]): Map<string, unknown[]> {
  const cols = new Map<string, unknown[]>();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (v === null || v === undefined || v === '') continue;
      const list = cols.get(k);
      if (list) list.push(v); else cols.set(k, [v]);
    }
  }
  return cols;
}

/**
 * Which of our fields does each source key carry?
 *
 * Returns a map of `source key → field`. A field is assigned to at most one
 * key: the one with the best (coverage, hint, specificity) standing, so a row
 * with both `image` and `thumbnail` picks one rather than fighting over it.
 */
export function inferFields(sampleRows: Row[]): Partial<Record<string, FieldName>> {
  const rows = sampleRows.map(r => flattenRow(r));
  const n = rows.length;
  if (n === 0) return {};
  const cols = columns(rows);

  // Score every (key, field) pair that passes the shape test.
  type Cand = { key: string; field: FieldName; coverage: number; hinted: boolean; depth: number };
  const cands: Cand[] = [];

  for (const [key, values] of cols) {
    const shortKey = key.split('.').pop() ?? key;
    for (const field of Object.keys(SHAPE) as FieldName[]) {
      const test = SHAPE[field];
      const hits = values.reduce<number>((s, v) => s + (test(v) ? 1 : 0), 0);
      // Coverage is over ALL rows, not just rows where the key was present —
      // a key that only exists on 3 of 50 rows is not this record's date field.
      const coverage = hits / n;
      const need = MIN_COVERAGE[field] ?? DEFAULT_COVERAGE;
      if (coverage < need) continue;
      const hint = KEY_HINTS[field];
      cands.push({
        key, field, coverage,
        hinted: hint ? hint.test(shortKey) : false,
        depth: key.split('.').length,
      });
    }
  }

  // A hinted candidate beats an unhinted one of similar coverage; among equals,
  // prefer the shallower key (`name` over `organizer.name`) and higher coverage.
  cands.sort((a, b) => {
    if (a.hinted !== b.hinted) return a.hinted ? -1 : 1;
    if (Math.abs(a.coverage - b.coverage) > 0.05) return b.coverage - a.coverage;
    return a.depth - b.depth;
  });

  const out: Partial<Record<string, FieldName>> = {};
  const takenFields = new Set<FieldName>();
  const takenKeys = new Set<string>();
  for (const c of cands) {
    if (takenFields.has(c.field) || takenKeys.has(c.key)) continue;
    // Latitude and longitude are only believable as a pair.
    takenFields.add(c.field);
    takenKeys.add(c.key);
    out[c.key] = c.field;
  }
  if (!Object.values(out).includes('lat') || !Object.values(out).includes('lng')) {
    for (const [k, f] of Object.entries(out)) {
      if (f === 'lat' || f === 'lng') delete out[k];
    }
  }
  return out;
}

/** Apply an inferred/learned field map to one raw row. */
export function applyFields(
  row: Row, fields: Partial<Record<string, FieldName>>,
): Partial<Record<FieldName, unknown>> {
  const flat = flattenRow(row);
  const out: Partial<Record<FieldName, unknown>> = {};
  for (const [key, field] of Object.entries(fields)) {
    if (!field) continue;
    const v = flat[key];
    if (v === null || v === undefined || v === '') continue;
    if (out[field] === undefined) out[field] = v;
  }
  return out;
}
