import { describe, it, expect } from 'vitest';
import { lockoutFor, isWrongCredential } from '@/app/api/auth/[...path]/route';

describe('lockoutFor', () => {
  it('does not punish ordinary typos', () => {
    // Real people mistype passwords. Nothing should happen for the first few.
    for (const n of [0, 1, 2, 3, 4]) expect(lockoutFor(n), `${n} failures`).toBe(0);
  });

  it('escalates as guessing continues', () => {
    expect(lockoutFor(5)).toBe(30);
    expect(lockoutFor(8)).toBe(120);
    expect(lockoutFor(12)).toBe(900);
    expect(lockoutFor(20)).toBe(3600);
  });

  it('is monotonic — more failures never means a shorter lockout', () => {
    let prev = 0;
    for (let n = 0; n <= 60; n++) {
      const cur = lockoutFor(n);
      expect(cur, `failures=${n}`).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  it('stays capped at the top step', () => {
    expect(lockoutFor(1000)).toBe(3600);
  });
});

describe('isWrongCredential', () => {
  it('counts a genuine wrong password', () => {
    expect(isWrongCredential(400, JSON.stringify({ error_code: 'invalid_credentials' }))).toBe(true);
    expect(isWrongCredential(400, JSON.stringify({ msg: 'Invalid login credentials' }))).toBe(true);
  });

  it('does NOT count a CAPTCHA failure', () => {
    // The critical case. Supabase checks CAPTCHA before the password, so if this
    // counted, anyone could lock any user out by posting their email with no
    // captcha token — verified live: 400 captcha_failed.
    const body = JSON.stringify({
      code: 400,
      error_code: 'captcha_failed',
      msg: 'captcha protection: request disallowed (no captcha_token found)',
    });
    expect(isWrongCredential(400, body)).toBe(false);
  });

  it('does not count validation or already-exists errors', () => {
    expect(isWrongCredential(400, JSON.stringify({ error_code: 'validation_failed' }))).toBe(false);
    expect(isWrongCredential(422, JSON.stringify({ error_code: 'user_already_exists' }))).toBe(false);
    expect(isWrongCredential(400, JSON.stringify({ error_code: 'email_address_invalid' }))).toBe(false);
  });

  it('does not count throttling or upstream failures', () => {
    expect(isWrongCredential(429, JSON.stringify({ error_code: 'invalid_credentials' }))).toBe(false);
    expect(isWrongCredential(500, JSON.stringify({ error_code: 'invalid_credentials' }))).toBe(false);
    expect(isWrongCredential(503, '')).toBe(false);
  });

  it('does not count an unparseable body', () => {
    expect(isWrongCredential(400, '<html>gateway error</html>')).toBe(false);
    expect(isWrongCredential(400, '')).toBe(false);
  });

  it('does not count a success', () => {
    expect(isWrongCredential(200, JSON.stringify({ access_token: 'x' }))).toBe(false);
  });
});
