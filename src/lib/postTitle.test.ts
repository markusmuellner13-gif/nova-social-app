import { describe, it, expect } from 'vitest';
import { isUrlish, cleanTitle, titleFromCaption, postTitle } from './postTitle';

describe('isUrlish', () => {
  it('rejects the exact string that shipped as a headline in production', () => {
    // Measured on the live feed 2026-08-06: this was the card's title.
    expect(isUrlish('https://allevents.in/org/feverup-vienna')).toBe(true);
  });
  it('catches schemeless links too', () => {
    expect(isUrlish('www.eventbrite.com/e/123')).toBe(true);
    expect(isUrlish('allevents.in/org/feverup')).toBe(true);
  });
  it('leaves real names alone', () => {
    expect(isUrlish('Candlelight: Best of Adele')).toBe(false);
    expect(isUrlish('Café Leopold')).toBe(false);
    // A name containing a dot must not be mistaken for a domain.
    expect(isUrlish('R.E.M. tribute night')).toBe(false);
  });
});

describe('cleanTitle', () => {
  it('drops URLs rather than showing them', () => {
    expect(cleanTitle('https://allevents.in/org/feverup-vienna')).toBe('');
  });
  it('drops the emoji metadata lines captions are built from', () => {
    expect(cleanTitle('📅 Friday, 7 August 2026')).toBe('');
    expect(cleanTitle('📍 The Comedy Pub, Wien')).toBe('');
    expect(cleanTitle('🔗 Tickets & info: https://x.y')).toBe('');
  });
  it('collapses the whitespace crawled JSON-LD is full of', () => {
    expect(cleanTitle('Rooftop   party\n  with a view')).toBe('Rooftop party with a view');
  });
  it('ellipsises rather than cutting mid-word at the limit', () => {
    const out = cleanTitle('A'.repeat(200), 20);
    expect(out).toHaveLength(20);
    expect(out.endsWith('…')).toBe(true);
  });
  it('rejects noise', () => {
    expect(cleanTitle('')).toBe('');
    expect(cleanTitle(null)).toBe('');
    expect(cleanTitle('  ')).toBe('');
    expect(cleanTitle('ok')).toBe('');
  });
});

describe('titleFromCaption', () => {
  it('takes the first real line', () => {
    expect(titleFromCaption('Rooftop party with a view\n\n📅 Sat 8 Aug\n📍 Juwel Wien'))
      .toBe('Rooftop party with a view');
  });
  it('returns nothing when that line is a URL', () => {
    expect(titleFromCaption('https://allevents.in/org/feverup\n\n📅 Sat')).toBe('');
  });
});

describe('postTitle', () => {
  it('prefers the source event name over the caption blurb', () => {
    expect(postTitle({
      title: 'Candlelight: Best of Adele',
      caption: 'Registration opens 3 weeks before the event and closes…',
    })).toBe('Candlelight: Best of Adele');
  });

  it('falls back to the caption for legacy rows with no title', () => {
    expect(postTitle({ caption: 'Rooftop party with a view\n\n📅 Sat' }))
      .toBe('Rooftop party with a view');
  });

  it('never renders a URL, even when it is all the row has', () => {
    const out = postTitle({
      title: 'https://allevents.in/org/feverup-vienna',
      caption: 'https://allevents.in/org/feverup-vienna\n\n📅 Mon 24 Aug',
      eventVenue: 'Palais Coburg',
    });
    expect(out).toBe('Palais Coburg');
  });

  it('walks venue → location → user before giving up', () => {
    expect(postTitle({ location: { name: 'Wien Innenstadt' } })).toBe('Wien Innenstadt');
    expect(postTitle({ user: { name: 'The Comedy Pub' } })).toBe('The Comedy Pub');
  });

  it('returns the caller fallback when a post carries nothing usable', () => {
    expect(postTitle({}, 'Trending')).toBe('Trending');
    expect(postTitle({ caption: '📍 Wien' }, 'Event')).toBe('Event');
  });
});
