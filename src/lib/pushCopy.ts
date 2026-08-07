// ─────────────────────────────────────────────────────────────────────────────
// Push notification copy, in ONE language, in a FEW words.
//
// WHAT THIS FIXES — the old copy pasted the event's own title into an English
// template. Since Nova's whole point is real local listings, that title is in
// the local language, so a German user in Vienna got:
//
//   "Tonight in Vienna 🌃"
//   "Endlich ist es so weit: Alegría öffnet seine… +7 more near you. Make plans →"
//
// Two languages in one notification, ~15 words, and the interesting part cut
// off. Notifications are also the one surface where you cannot recover from a
// bad impression — the user just turns them off.
//
// So: no raw event title at all. Every string here is built entirely from the
// user's profile language (LanguageContext → the `locale` stored with the push
// subscription), and every one is a short phrase — a hook, not a summary. The
// event's real name is one tap away in the app, which is the point.
//
// Rules for anything added here:
//   • ≤ 6 words. If it needs a comma, it's too long.
//   • No interpolated content from a source — only city, count and locale.
//   • Say what's there and when. Curiosity, never clickbait: the count is real,
//     so "3 things on tonight" must mean three things are actually on tonight.
// ─────────────────────────────────────────────────────────────────────────────

import type { Locale } from './translations';

export type PushKind =
  | 'tonight'    // evening, something on today
  | 'today'      // morning brief
  | 'weekend'    // Thu/Fri roundup
  | 'nearby'     // generic "things near you"
  | 'discover'   // nothing dated — discovery nudge
  | 'friend';    // someone you follow is going

export interface PushMessage { title: string; body: string }

// `name` is only ever a person's display name (a friend who is going) — a
// proper noun, not source prose, so it can't drag a second language in.
type Phrase = (city: string, n: number, name: string) => PushMessage;

// One table per locale. `n` is a real count; callers pass 0 when unknown and
// the copy falls back to a countless phrasing.
const COPY: Record<Locale, Record<PushKind, Phrase>> = {
  en: {
    tonight:  (c, n) => ({ title: n ? `${n} things on tonight 🌃` : `Something on tonight 🌃`, body: `In ${c}.` }),
    today:    (c, n) => ({ title: n ? `${n} things on today ☀️` : `Today in ${c} ☀️`,          body: `In ${c}.` }),
    weekend:  (c, n) => ({ title: n ? `${n} plans this weekend ✨` : `Your weekend in ${c} ✨`, body: `In ${c}.` }),
    nearby:   (c, n) => ({ title: n ? `${n} things near you 📍` : `Something near you 📍`,      body: `In ${c}.` }),
    discover: (c)    => ({ title: `What's good in ${c}? 🧭`,                                    body: `Have a look.` }),
    friend:   (c, n, name) => ({ title: name ? `${name} is going 👀` : `A friend is going 👀`,   body: `See what it is.` }),
  },
  de: {
    tonight:  (c, n) => ({ title: n ? `${n} Sachen heute Abend 🌃` : `Heute Abend was los 🌃`,  body: `In ${c}.` }),
    today:    (c, n) => ({ title: n ? `${n} Sachen heute ☀️` : `Heute in ${c} ☀️`,             body: `In ${c}.` }),
    weekend:  (c, n) => ({ title: n ? `${n} Ideen fürs Wochenende ✨` : `Dein Wochenende ✨`,   body: `In ${c}.` }),
    nearby:   (c, n) => ({ title: n ? `${n} Sachen in der Nähe 📍` : `Was in der Nähe 📍`,      body: `In ${c}.` }),
    discover: (c)    => ({ title: `Was geht in ${c}? 🧭`,                                       body: `Schau mal rein.` }),
    friend:   (c, n, name) => ({ title: name ? `${name} geht hin 👀` : `Jemand geht hin 👀`,     body: `Schau nach.` }),
  },
  es: {
    tonight:  (c, n) => ({ title: n ? `${n} planes esta noche 🌃` : `Algo esta noche 🌃`,       body: `En ${c}.` }),
    today:    (c, n) => ({ title: n ? `${n} planes para hoy ☀️` : `Hoy en ${c} ☀️`,            body: `En ${c}.` }),
    weekend:  (c, n) => ({ title: n ? `${n} planes este finde ✨` : `Tu finde en ${c} ✨`,      body: `En ${c}.` }),
    nearby:   (c, n) => ({ title: n ? `${n} planes cerca 📍` : `Algo cerca de ti 📍`,           body: `En ${c}.` }),
    discover: (c)    => ({ title: `¿Qué se cuece en ${c}? 🧭`,                                  body: `Échale un ojo.` }),
    friend:   (c, n, name) => ({ title: name ? `${name} va a ir 👀` : `Un amigo va a ir 👀`,     body: `Mira qué es.` }),
  },
  fr: {
    tonight:  (c, n) => ({ title: n ? `${n} sorties ce soir 🌃` : `Quelque chose ce soir 🌃`,   body: `À ${c}.` }),
    today:    (c, n) => ({ title: n ? `${n} sorties aujourd'hui ☀️` : `Aujourd'hui à ${c} ☀️`, body: `À ${c}.` }),
    weekend:  (c, n) => ({ title: n ? `${n} idées ce week-end ✨` : `Ton week-end à ${c} ✨`,   body: `À ${c}.` }),
    nearby:   (c, n) => ({ title: n ? `${n} sorties près de toi 📍` : `Près de toi 📍`,         body: `À ${c}.` }),
    discover: (c)    => ({ title: `Quoi de neuf à ${c} ? 🧭`,                                   body: `Viens voir.` }),
    friend:   (c, n, name) => ({ title: name ? `${name} y va 👀` : `Un ami y va 👀`,             body: `Regarde.` }),
  },
  it: {
    tonight:  (c, n) => ({ title: n ? `${n} cose stasera 🌃` : `Qualcosa stasera 🌃`,           body: `A ${c}.` }),
    today:    (c, n) => ({ title: n ? `${n} cose oggi ☀️` : `Oggi a ${c} ☀️`,                  body: `A ${c}.` }),
    weekend:  (c, n) => ({ title: n ? `${n} idee per il weekend ✨` : `Il tuo weekend ✨`,      body: `A ${c}.` }),
    nearby:   (c, n) => ({ title: n ? `${n} cose vicino a te 📍` : `Vicino a te 📍`,            body: `A ${c}.` }),
    discover: (c)    => ({ title: `Che si fa a ${c}? 🧭`,                                       body: `Dai un'occhiata.` }),
    friend:   (c, n, name) => ({ title: name ? `${name} ci va 👀` : `Un amico ci va 👀`,         body: `Guarda cos'è.` }),
  },
  pt: {
    tonight:  (c, n) => ({ title: n ? `${n} coisas hoje à noite 🌃` : `Algo hoje à noite 🌃`,   body: `Em ${c}.` }),
    today:    (c, n) => ({ title: n ? `${n} coisas hoje ☀️` : `Hoje em ${c} ☀️`,               body: `Em ${c}.` }),
    weekend:  (c, n) => ({ title: n ? `${n} ideias pro fim de semana ✨` : `Seu fim de semana ✨`, body: `Em ${c}.` }),
    nearby:   (c, n) => ({ title: n ? `${n} coisas perto de você 📍` : `Perto de você 📍`,      body: `Em ${c}.` }),
    discover: (c)    => ({ title: `O que rola em ${c}? 🧭`,                                     body: `Dá uma olhada.` }),
    friend:   (c, n, name) => ({ title: name ? `${name} vai 👀` : `Um amigo vai 👀`,             body: `Veja o que é.` }),
  },
  nl: {
    tonight:  (c, n) => ({ title: n ? `${n} dingen vanavond 🌃` : `Iets vanavond 🌃`,           body: `In ${c}.` }),
    today:    (c, n) => ({ title: n ? `${n} dingen vandaag ☀️` : `Vandaag in ${c} ☀️`,         body: `In ${c}.` }),
    weekend:  (c, n) => ({ title: n ? `${n} ideeën dit weekend ✨` : `Jouw weekend in ${c} ✨`, body: `In ${c}.` }),
    nearby:   (c, n) => ({ title: n ? `${n} dingen bij jou 📍` : `Bij jou in de buurt 📍`,      body: `In ${c}.` }),
    discover: (c)    => ({ title: `Wat is er in ${c}? 🧭`,                                      body: `Kijk even.` }),
    friend:   (c, n, name) => ({ title: name ? `${name} gaat 👀` : `Een vriend gaat 👀`,         body: `Kijk wat het is.` }),
  },
  ja: {
    tonight:  (c, n) => ({ title: n ? `今夜${n}件 🌃` : `今夜なにかある 🌃`,                     body: `${c}で。` }),
    today:    (c, n) => ({ title: n ? `今日${n}件 ☀️` : `今日の${c} ☀️`,                        body: `${c}で。` }),
    weekend:  (c, n) => ({ title: n ? `週末に${n}件 ✨` : `${c}の週末 ✨`,                       body: `${c}で。` }),
    nearby:   (c, n) => ({ title: n ? `近くで${n}件 📍` : `近くでなにかある 📍`,                 body: `${c}で。` }),
    discover: (c)    => ({ title: `${c}はいま何がある？🧭`,                                      body: `のぞいてみて。` }),
    friend:   (c, n, name) => ({ title: name ? `${name}が行くみたい 👀` : `友だちが行くみたい 👀`, body: `見てみて。` }),
  },
};

export const SUPPORTED_PUSH_LOCALES = Object.keys(COPY) as Locale[];

/** Normalise anything stored on a subscription into a locale we actually have. */
export function resolveLocale(raw: unknown): Locale {
  if (typeof raw !== 'string') return 'en';
  const base = raw.toLowerCase().split(/[-_]/)[0];
  return (SUPPORTED_PUSH_LOCALES as string[]).includes(base) ? (base as Locale) : 'en';
}

/**
 * Build the notification. `city` is the only interpolated content and it is the
 * user's own city, not source text — so the message can never mix languages.
 */
export function buildLocalisedPush(
  kind: PushKind,
  { city, count = 0, locale = 'en', name = '' }:
    { city: string; count?: number; locale?: Locale | string; name?: string },
): PushMessage {
  const loc = resolveLocale(locale);
  const place = (city || '').trim();
  const table = COPY[loc] ?? COPY.en;
  const fn = table[kind] ?? table.nearby;
  // A count of 1 reads badly as "1 things"; the countless variant is better.
  const n = count > 1 ? count : 0;
  return fn(place || fallbackCity(loc), n, (name || '').trim().split(/\s+/)[0]?.slice(0, 24) ?? '');
}

function fallbackCity(loc: Locale): string {
  const byLocale: Record<Locale, string> = {
    en: 'your area', de: 'deiner Nähe', es: 'tu zona', fr: 'ta région',
    it: 'zona tua', pt: 'sua área', nl: 'jouw buurt', ja: 'この辺り',
  };
  return byLocale[loc] ?? 'your area';
}
