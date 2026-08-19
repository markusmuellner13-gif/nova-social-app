// ─────────────────────────────────────────────────────────────────────────────
// Shared vocabulary for Nova's adaptive extraction engine.
//
// The engine reads a web page and returns RECORDS — the things a traveller
// actually wants (an activity, a museum, a tour, a dated event). Every reader
// that can produce those records is a "skill". Some skills ship with the app
// (JSON-LD, microdata, embedded app state…), and some are LEARNED at runtime
// from a page no built-in skill could read; see learn.ts.
//
// Be precise about what "learning" means here, because it is easy to oversell:
// the engine learns *how to read a site's data format* — where the records sit
// in a payload and which key carries which field, including in a vocabulary it
// has never seen (Spanish `fecha`, Japanese `開始日`, an obfuscated `f_2`). It
// does that by looking at the SHAPE OF THE VALUES, not by understanding prose.
// It is a pattern learner with a persisted, reinforced skill set. It is not an
// LLM and does not become one.
// ─────────────────────────────────────────────────────────────────────────────

/** What a record is about. Drives which feed/tab it can appear in. */
export type RecordKind = 'event' | 'attraction' | 'tour' | 'place';

/** One real thing read off a page. All fields optional except name. */
export interface ExtractedRecord {
  kind: RecordKind;
  name: string;
  description?: string;
  /** Raw ISO-ish start/end as printed by the source; normalised downstream. */
  startDate?: string;
  endDate?: string;
  /** The page describing this thing. */
  url?: string;
  /** Where you actually buy/book it — Nova links out, it never sells. */
  ticketUrl?: string;
  image?: string;
  venue?: string;
  street?: string;
  locality?: string;
  region?: string;
  country?: string;
  lat?: number;
  lng?: number;
  price?: string;
  currency?: string;
  /** 0–5, only when the source states one. Never invented. */
  rating?: number;
  /** e.g. "2 hours" — tours and guided activities publish this. */
  duration?: string;
  openingHours?: string;
  organizer?: string;
  /** Which skill produced it — used for credit assignment and debugging. */
  via?: string;
}

/** Which of our record fields a source key was found to carry. */
export type FieldName =
  | 'name' | 'description' | 'startDate' | 'endDate' | 'url' | 'ticketUrl'
  | 'image' | 'venue' | 'street' | 'locality' | 'region' | 'country'
  | 'lat' | 'lng' | 'price' | 'currency' | 'rating' | 'duration'
  | 'openingHours' | 'organizer';

/**
 * A learned reader for one host's data format.
 *
 * `path` locates the array of records inside a harvested payload; `fields` maps
 * that array's own key names onto ours. Both are plain data on purpose — a
 * skill has to survive a round trip through Redis as JSON, so it can never be
 * a closure or a compiled regex.
 */
export interface LearnedSkill {
  id: string;
  host: string;
  /** Which harvester produced the payload this path applies to. */
  source: PayloadSource;
  /** Key/index path from the payload root down to the array of records. */
  path: string[];
  /** Source key → our field. */
  fields: Partial<Record<string, FieldName>>;
  kind: RecordKind;
  createdAt: number;
  lastUsed: number;
  /** Reinforcement counters — see skillStore.reward(). */
  trials: number;
  wins: number;
  /** EWMA of records-per-trial, the value used to order skills. */
  score: number;
}

/** Where a JSON payload was found in the HTML. */
export type PayloadSource =
  | 'ld+json'        // <script type="application/ld+json">
  | 'next-data'      // <script id="__NEXT_DATA__">
  | 'json-script'    // <script type="application/json">
  | 'inline-state';  // window.__NUXT__ / __INITIAL_STATE__ / __APOLLO_STATE__ =

/** A harvested payload plus enough context to re-find it next time. */
export interface Payload {
  source: PayloadSource;
  /** Stable id when the script tag had one (e.g. "__NEXT_DATA__"). */
  id?: string;
  data: unknown;
}

/** Per-run statistics the engine reports back to the caller. */
export interface ReadReport {
  host: string;
  records: number;
  /** skill id → records it contributed this run. */
  bySkill: Record<string, number>;
  /** A skill learned during THIS run, if any. */
  learned?: LearnedSkill;
}
