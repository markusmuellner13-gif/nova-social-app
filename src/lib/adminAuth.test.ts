import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAdminRequest, adminSecret } from './adminAuth';

function req(authorization?: string) {
  return { headers: { get: (n: string) => (n.toLowerCase() === 'authorization' ? authorization ?? null : null) } };
}

const ORIGINAL = { admin: process.env.ADMIN_SECRET, cron: process.env.CRON_SECRET };

describe('isAdminRequest', () => {
  beforeEach(() => {
    delete process.env.ADMIN_SECRET;
    delete process.env.CRON_SECRET;
  });
  afterEach(() => {
    if (ORIGINAL.admin === undefined) delete process.env.ADMIN_SECRET; else process.env.ADMIN_SECRET = ORIGINAL.admin;
    if (ORIGINAL.cron  === undefined) delete process.env.CRON_SECRET;  else process.env.CRON_SECRET  = ORIGINAL.cron;
  });

  it('refuses everything when no secret is configured', () => {
    expect(isAdminRequest(req('Bearer anything'))).toBe(false);
    expect(isAdminRequest(req())).toBe(false);
    expect(adminSecret()).toBe('');
  });

  it('SETTING ADMIN_SECRET REVOKES CRON_SECRET', () => {
    // The whole point of this module. Before it, cache/photos looped over both
    // and accepted either, so the widely-copied cron secret stayed an admin key
    // forever — verified in production, CRON_SECRET got 200 from /api/admin/photos.
    process.env.ADMIN_SECRET = 'admin-key-value';
    process.env.CRON_SECRET  = 'cron-key-value';
    expect(isAdminRequest(req('Bearer admin-key-value'))).toBe(true);
    expect(isAdminRequest(req('Bearer cron-key-value'))).toBe(false);
  });

  it('falls back to CRON_SECRET only while ADMIN_SECRET is unset', () => {
    // Back-compat: a project that hasn't split them yet keeps working.
    process.env.CRON_SECRET = 'cron-key-value';
    expect(isAdminRequest(req('Bearer cron-key-value'))).toBe(true);
  });

  it('rejects a wrong, empty or missing bearer token', () => {
    process.env.ADMIN_SECRET = 'admin-key-value';
    expect(isAdminRequest(req('Bearer wrong'))).toBe(false);
    expect(isAdminRequest(req('Bearer '))).toBe(false);
    expect(isAdminRequest(req(''))).toBe(false);
    expect(isAdminRequest(req())).toBe(false);
  });

  it('rejects a prefix of the real secret (no truncation match)', () => {
    process.env.ADMIN_SECRET = 'admin-key-value';
    expect(isAdminRequest(req('Bearer admin-key'))).toBe(false);
    expect(isAdminRequest(req('Bearer admin-key-value-extra'))).toBe(false);
  });

  it('accepts the bearer prefix case-insensitively', () => {
    process.env.ADMIN_SECRET = 'admin-key-value';
    expect(isAdminRequest(req('bearer admin-key-value'))).toBe(true);
    expect(isAdminRequest(req('BEARER admin-key-value'))).toBe(true);
  });
});
