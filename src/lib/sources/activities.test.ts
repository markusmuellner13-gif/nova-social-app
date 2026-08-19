import { describe, it, expect } from 'vitest';
import { findTicketLink, findVisitPage, classifyActivity, rankActivities, type ActivityPost } from './activities';
import type { ApiPost } from './shared';

const BASE = 'https://museum.example.org/en/visit';

const html = (body: string) => `<!doctype html><html><body>${body}</body></html>`;

describe('findTicketLink', () => {
  it('finds a same-site tickets page', () => {
    expect(findTicketLink(html(`
      <a href="/en/about">About us</a>
      <a href="/en/tickets">Buy tickets</a>
      <a href="/en/contact">Contact</a>
    `), BASE)).toBe('https://museum.example.org/en/tickets');
  });

  it('prefers a real ticketing host over a vague on-site link', () => {
    const found = findTicketLink(html(`
      <a href="/info/entry">Entry information</a>
      <a href="https://tickets.example-vendor.com/museum">Book now</a>
    `), BASE);
    expect(found).toBe('https://tickets.example-vendor.com/museum');
  });

  it('does not offer an "entry information" page as a place to buy a ticket', () => {
    // It describes the price; it does not sell anything. The card would have
    // said "Get tickets" and landed the user on a paragraph.
    expect(findTicketLink(html(`<a href="/info/entry">Entry information</a>`), BASE))
      .toBeUndefined();
  });

  it('resolves a relative link against the page it was found on', () => {
    expect(findTicketLink(html(`<a href="../booking">Booking</a>`), BASE))
      .toBe('https://museum.example.org/booking');
  });

  it('recognises the word in other languages', () => {
    expect(findTicketLink(html(`<a href="/de/eintritt">Eintritt &amp; Öffnungszeiten</a>`), BASE))
      .toBe('https://museum.example.org/de/eintritt');
    expect(findTicketLink(html(`<a href="/fr/billetterie">Billetterie</a>`), BASE))
      .toBe('https://museum.example.org/fr/billetterie');
  });

  it('ignores gift shops, memberships and donation pages', () => {
    expect(findTicketLink(html(`
      <a href="/shop/gift-vouchers">Gift vouchers</a>
      <a href="/support/membership">Buy a membership</a>
      <a href="/donate">Donate</a>
    `), BASE)).toBeUndefined();
  });

  it('will not offer a bare homepage as a ticket link', () => {
    expect(findTicketLink(html(`<a href="https://tickets.example.com/">Tickets</a>`), BASE))
      .toBeUndefined();
  });

  it('returns nothing rather than guessing when the page has no booking route', () => {
    expect(findTicketLink(html(`<a href="/news">News</a><a href="/press">Press</a>`), BASE))
      .toBeUndefined();
    expect(findTicketLink('', BASE)).toBeUndefined();
  });

  it('skips mailto and tel links', () => {
    expect(findTicketLink(html(`<a href="mailto:tickets@museum.org">Tickets by email</a>`), BASE))
      .toBeUndefined();
  });
});

describe('classifyActivity', () => {
  const post = (over: Partial<ApiPost>): ApiPost => ({
    id: 'x', user: {} as ApiPost['user'], image: '', caption: '', likes: 0, comments: 0,
    category: 'sightseeing', hashtags: [], timestamp: 0,
    location: { name: '', lat: 0, lng: 0 }, saved: false, liked: false,
    isEvent: false, isAIGenerated: false, ...over,
  });

  it('spots museums in several languages', () => {
    expect(classifyActivity(post({ title: 'Museo Nazionale Romano' }))).toBe('museum');
    expect(classifyActivity(post({ title: 'Musée d’Orsay' }))).toBe('museum');
    expect(classifyActivity(post({ title: 'Albertina Galerie' }))).toBe('museum');
  });

  it('spots guided tours', () => {
    expect(classifyActivity(post({ title: 'Walking tour of the old town' }))).toBe('tour');
    expect(classifyActivity(post({ title: 'Führung durch die Hofburg' }))).toBe('tour');
  });

  it('treats an undated landmark as a sight', () => {
    expect(classifyActivity(post({ title: 'Stephansplatz', category: 'sightseeing' }))).toBe('sightseeing');
  });

  it('treats a dated listing as an event when nothing more specific fits', () => {
    expect(classifyActivity(post({ title: 'Klangfest 2026', eventDateRaw: '2026-09-12' }))).toBe('event');
  });

  it('lets a dated guided tour stay a tour', () => {
    expect(classifyActivity(post({ title: 'Guided tour: rooftops at sunset', eventDateRaw: '2026-09-12' })))
      .toBe('tour');
  });
});

describe('rankActivities', () => {
  const act = (over: Partial<ActivityPost>): ActivityPost => ({
    id: over.id ?? 'a', user: {} as ApiPost['user'], image: '', caption: '', likes: 0, comments: 0,
    category: 'sightseeing', hashtags: [], timestamp: 0,
    location: { name: '', lat: 48.2, lng: 16.37 }, saved: false, liked: false,
    isEvent: false, isAIGenerated: false, activityKind: 'sightseeing', ...over,
  });
  const q = { city: 'Vienna', country: 'Austria', lat: 48.2, lng: 16.37 };

  it('puts a bookable card with a photo above a bare one', () => {
    const ranked = rankActivities([
      act({ id: 'bare' }),
      act({ id: 'rich', image: 'https://e.org/p.jpg', ticketUrl: 'https://e.org/tickets' }),
    ], q);
    expect(ranked[0].id).toBe('rich');
  });

  it('does not reorder into a different set of posts', () => {
    const input = [act({ id: '1' }), act({ id: '2' }), act({ id: '3' })];
    const ranked = rankActivities(input, q);
    expect(ranked.map(p => p.id).sort()).toEqual(['1', '2', '3']);
    // …and leaves the caller's array alone.
    expect(input.map(p => p.id)).toEqual(['1', '2', '3']);
  });
});

describe('findTicketLink — not everything that sells is admission', () => {
  it('does not mistake a museum gift-shop product for a ticket', () => {
    // Real shape from khm.at: a shop subdomain whose product pages match both
    // "shop" and "book". Treating shop hosts as ticket hosts put an exhibition
    // catalogue above the actual admission page.
    const found = findTicketLink(html(`
      <a href="https://shop.khm.at">Shop</a>
      <a href="https://shop.khm.at/en/products/100000000039077">Canaletto &amp; Bellotto</a>
      <a href="/en/tickets">Tickets</a>
    `), 'https://www.khm.at/en/');
    expect(found).toBe('https://www.khm.at/en/tickets');
  });

  it('returns nothing when the only candidates are merchandise', () => {
    expect(findTicketLink(html(`
      <a href="https://shop.example.org/products/44">Buy the book</a>
      <a href="https://shop.example.org/merch">Shop</a>
    `), 'https://www.example.org/')).toBeUndefined();
  });
});

describe('findVisitPage', () => {
  it('finds the "plan your visit" page when there is no direct ticket link', () => {
    expect(findVisitPage(html(`
      <a href="/en/news">News</a>
      <a href="/en/plan-your-visit">Plan your Visit</a>
    `), 'https://www.mozarthausvienna.at/en/'))
      .toBe('https://www.mozarthausvienna.at/en/plan-your-visit');
  });

  it('never leaves the site it was given', () => {
    expect(findVisitPage(html(`<a href="https://elsewhere.example/visit">Visit</a>`), 'https://museum.example/'))
      .toBeUndefined();
  });

  it('ignores the landing page itself', () => {
    expect(findVisitPage(html(`<a href="/">Visit us</a>`), 'https://museum.example/')).toBeUndefined();
  });
});
