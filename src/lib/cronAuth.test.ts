import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isCronRequest, cronSecret } from './cronAuth';

function req(authorization?: string) {
  return { headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? authorization ?? null : null) } };
}

const ORIGINAL = { admin: process.env.ADMIN_SECRET, cron: process.env.CRON_SECRET };

describe('isCronRequest', () => {
  beforeEach(() => {
    delete process.env.ADMIN_SECRET;
    delete process.env.CRON_SECRET;
  });
  afterEach(() => {
    if (ORIGINAL.admin === undefined) delete process.env.ADMIN_SECRET; else process.env.ADMIN_SECRET = ORIGINAL.admin;
    if (ORIGINAL.cron  === undefined) delete process.env.CRON_SECRET;  else process.env.CRON_SECRET  = ORIGINAL.cron;
  });

  it('FAILS CLOSED when no secret is configured', () => {
    // The whole reason this module exists. The old inline guard was
    //   const s = process.env.CRON_SECRET; if (s) { ...401... }
    // so an unset variable skipped auth entirely and left /api/cron/push —
    // which sends push notifications to real users — publicly callable.
    expect(isCronRequest(req('Bearer anything'))).toBe(false);
    expect(isCronRequest(req())).toBe(false);
    expect(cronSecret()).toBe('');
  });

  it('accepts the cron secret', () => {
    process.env.CRON_SECRET = 'cron-key-value';
    expect(isCronRequest(req('Bearer cron-key-value'))).toBe(true);
  });

  it('falls back to ADMIN_SECRET only when CRON_SECRET is unset', () => {
    // Preserves what /api/cron/brain already did, so no route changes which key
    // it honours.
    process.env.ADMIN_SECRET = 'admin-key-value';
    expect(isCronRequest(req('Bearer admin-key-value'))).toBe(true);

    process.env.CRON_SECRET = 'cron-key-value';
    expect(isCronRequest(req('Bearer cron-key-value'))).toBe(true);
    expect(isCronRequest(req('Bearer admin-key-value'))).toBe(false);
  });

  it('rejects wrong, empty and missing tokens', () => {
    process.env.CRON_SECRET = 'cron-key-value';
    expect(isCronRequest(req('Bearer wrong'))).toBe(false);
    expect(isCronRequest(req('Bearer '))).toBe(false);
    expect(isCronRequest(req(''))).toBe(false);
    expect(isCronRequest(req())).toBe(false);
  });

  it('rejects a prefix or extension of the real secret', () => {
    process.env.CRON_SECRET = 'cron-key-value';
    expect(isCronRequest(req('Bearer cron-key'))).toBe(false);
    expect(isCronRequest(req('Bearer cron-key-value-extra'))).toBe(false);
  });

  it('accepts the bearer prefix case-insensitively', () => {
    process.env.CRON_SECRET = 'cron-key-value';
    expect(isCronRequest(req('bearer cron-key-value'))).toBe(true);
  });

  it('cronSecret() returns the key that warm forwards to push and brain', () => {
    // /api/cron/warm chains into both, which now fail closed — so whatever
    // authenticated warm must be what warm passes on, or the digest dies silently.
    process.env.CRON_SECRET = 'cron-key-value';
    expect(cronSecret()).toBe('cron-key-value');
  });
});
