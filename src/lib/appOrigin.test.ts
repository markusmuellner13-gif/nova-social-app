import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { appOrigin } from './appOrigin';

// ─────────────────────────────────────────────────────────────────────────────
// This project runs with Vercel Authentication on (all_except_custom_domains).
// The production alias is exempt; the PER-DEPLOYMENT url is not and answers 302
// to anything without an SSO session.
//
// A Vercel cron invokes the per-deployment url. So any route that fetched its
// own /api/feed using `new URL(request.url).origin` fetched a redirect instead
// of a feed, found no posts, and wrote nothing — while still returning 200 with
// `ingested: 0`, which reads exactly like "nothing to do". That is why
// /api/cron/warm had been quietly doing nothing.
// ─────────────────────────────────────────────────────────────────────────────

const DEPLOYMENT = { url: 'https://nova-mn9k83hdx-someteam.vercel.app/api/cron/ingest' };
const ALIAS      = { url: 'https://nova-phi-liart.vercel.app/api/feed?category=events' };

const KEYS = ['VERCEL_ENV', 'VERCEL_PROJECT_PRODUCTION_URL', 'NEXT_PUBLIC_SITE_URL'] as const;
const saved: Record<string, string | undefined> = {};

describe('appOrigin', () => {
  beforeEach(() => {
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  });

  it('IGNORES the per-deployment url in production — the actual bug', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'nova-phi-liart.vercel.app';
    expect(appOrigin(DEPLOYMENT)).toBe('https://nova-phi-liart.vercel.app');
  });

  it('prefers what Vercel reports over a hand-entered value', () => {
    // Vercel sets its own variable and it cannot drift; NEXT_PUBLIC_SITE_URL can
    // be edited to a domain that is not live yet, which would break every
    // internal fetch at once.
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'nova-phi-liart.vercel.app';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://not-live-yet.example';
    expect(appOrigin(DEPLOYMENT)).toBe('https://nova-phi-liart.vercel.app');
  });

  it('falls back to the configured site url when Vercel reports none', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://nova.example.com/';
    expect(appOrigin(DEPLOYMENT)).toBe('https://nova.example.com');   // trailing slash trimmed
  });

  it('ignores junk configuration rather than building a broken url', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.NEXT_PUBLIC_SITE_URL = 'not a url';
    expect(appOrigin(ALIAS)).toBe('https://nova-phi-liart.vercel.app');   // request origin

    process.env.NEXT_PUBLIC_SITE_URL = 'http://insecure.example';        // http, not https
    expect(appOrigin(ALIAS)).toBe('https://nova-phi-liart.vercel.app');
  });

  it('leaves preview and local development on the request origin', () => {
    // Outside production the request's own origin is the right answer, and
    // pointing a preview at the production domain would make it read and write
    // live data while pretending to be a preview.
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'nova-phi-liart.vercel.app';
    expect(appOrigin({ url: 'https://nova-git-branch-team.vercel.app/api/chat' }))
      .toBe('https://nova-git-branch-team.vercel.app');

    delete process.env.VERCEL_ENV;
    expect(appOrigin({ url: 'http://localhost:3000/api/cron/ingest' }))
      .toBe('http://localhost:3000');
  });
});
