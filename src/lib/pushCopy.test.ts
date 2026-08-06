import { describe, it, expect } from 'vitest';
import { buildLocalisedPush, resolveLocale, SUPPORTED_PUSH_LOCALES, PushKind } from './pushCopy';
import { chooseSmartPush } from './pushContent';
import type { ApiPost } from './sources/shared';

const KINDS: PushKind[] = ['tonight', 'today', 'weekend', 'nearby', 'discover', 'friend'];

describe('resolveLocale', () => {
  it('accepts the app locales', () => {
    expect(resolveLocale('de')).toBe('de');
    expect(resolveLocale('ja')).toBe('ja');
  });
  it('normalises regional tags', () => {
    expect(resolveLocale('de-AT')).toBe('de');
    expect(resolveLocale('pt_BR')).toBe('pt');
  });
  it('falls back to English for anything unknown', () => {
    expect(resolveLocale('kl')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale(42)).toBe('en');
  });
});

describe('buildLocalisedPush', () => {
  it('writes German for a German user — no English left in it', () => {
    const m = buildLocalisedPush('tonight', { city: 'Wien', count: 3, locale: 'de' });
    expect(m.title).toBe('3 Sachen heute Abend 🌃');
    expect(m.body).toBe('In Wien.');
    expect(`${m.title} ${m.body}`).not.toMatch(/\b(tonight|things|near you|more|make plans)\b/i);
  });

  it('never says "1 things"', () => {
    for (const loc of SUPPORTED_PUSH_LOCALES) {
      const m = buildLocalisedPush('tonight', { city: 'X', count: 1, locale: loc });
      expect(m.title).not.toMatch(/(^|\D)1\s/);
    }
  });

  it('stays short in every locale and kind — this is the whole point', () => {
    for (const loc of SUPPORTED_PUSH_LOCALES) {
      for (const kind of KINDS) {
        const m = buildLocalisedPush(kind, { city: 'Vienna', count: 3, locale: loc, name: 'Anna' });
        expect(m.title.length, `${loc}/${kind} title`).toBeLessThanOrEqual(42);
        expect(m.body.length, `${loc}/${kind} body`).toBeLessThanOrEqual(30);
        expect(m.title.length).toBeGreaterThan(0);
        expect(m.body.length).toBeGreaterThan(0);
      }
    }
  });

  it('every locale implements every kind', () => {
    for (const loc of SUPPORTED_PUSH_LOCALES) {
      for (const kind of KINDS) {
        const m = buildLocalisedPush(kind, { city: 'Vienna', locale: loc });
        expect(m.title, `${loc}/${kind}`).toBeTruthy();
      }
    }
  });

  it('uses a friend’s first name only, and copes without one', () => {
    expect(buildLocalisedPush('friend', { city: 'Wien', locale: 'de', name: 'Anna Müller' }).title)
      .toBe('Anna geht hin 👀');
    expect(buildLocalisedPush('friend', { city: 'Wien', locale: 'de' }).title)
      .toBe('Jemand geht hin 👀');
  });

  it('falls back to a localised place word when the city is unknown', () => {
    const m = buildLocalisedPush('nearby', { city: '', count: 2, locale: 'de' });
    expect(m.body).toBe('In deiner Nähe.');
  });

  it('carries no event text at all — the source language can never leak in', () => {
    // A German event title must not be able to reach an English user's push.
    const m = buildLocalisedPush('tonight', { city: 'Vienna', count: 4, locale: 'en' });
    expect(m.title + m.body).not.toMatch(/Alegría|öffnet|Endlich/);
  });
});

describe('chooseSmartPush', () => {
  const ev = (date: string, category = 'music'): ApiPost => ({
    caption: 'Some real event\n\n📅 x', eventDateRaw: date, category,
  } as unknown as ApiPost);

  const at = (iso: string) => new Date(iso);

  it('returns discover when nothing is dated', () => {
    expect(chooseSmartPush({ events: [], now: at('2026-08-06T18:00:00') }).kind).toBe('discover');
  });

  it('says tonight in the evening when something is on today', () => {
    const now = at('2026-08-06T19:00:00');
    const r = chooseSmartPush({ events: [ev('2026-08-06'), ev('2026-08-06')], now });
    expect(r.kind).toBe('tonight');
    expect(r.count).toBe(2);
  });

  it('does a weekend roundup on Thursday with 3+ weekend events', () => {
    const thu = at('2026-08-06T12:00:00'); // a Thursday
    const r = chooseSmartPush({ events: [ev('2026-08-08'), ev('2026-08-08'), ev('2026-08-09')], now: thu });
    expect(r.kind).toBe('weekend');
    expect(r.count).toBe(3);
  });

  it('gives a morning brief before 11', () => {
    expect(chooseSmartPush({ events: [ev('2026-08-06')], now: at('2026-08-06T08:00:00') }).kind).toBe('today');
  });

  it('returns a real count, so the copy never overstates', () => {
    const r = chooseSmartPush({ events: [ev('2026-08-20'), ev('2026-08-21')], now: at('2026-08-06T13:00:00') });
    expect(r.kind).toBe('nearby');
    expect(r.count).toBe(2);
  });
});
