import { describe, it, expect } from 'vitest';
import { rewriteAuthUrl } from './authProxy';

const SB = 'https://abcdefg.supabase.co';

describe('rewriteAuthUrl', () => {
  it('routes sign-in (password grant) through our origin', () => {
    expect(rewriteAuthUrl(`${SB}/auth/v1/token?grant_type=password`, SB))
      .toBe('/api/auth/token?grant_type=password');
  });

  it('routes signup, recover and otp through our origin', () => {
    expect(rewriteAuthUrl(`${SB}/auth/v1/signup`, SB)).toBe('/api/auth/signup');
    expect(rewriteAuthUrl(`${SB}/auth/v1/recover`, SB)).toBe('/api/auth/recover');
    expect(rewriteAuthUrl(`${SB}/auth/v1/otp`, SB)).toBe('/api/auth/otp');
  });

  it('LEAVES TOKEN REFRESH ALONE', () => {
    // The single most important case. Refresh runs constantly for every signed-in
    // user; rate limiting it would log people out for using the app normally.
    expect(rewriteAuthUrl(`${SB}/auth/v1/token?grant_type=refresh_token`, SB)).toBeNull();
  });

  it('leaves a token call with no grant_type alone', () => {
    expect(rewriteAuthUrl(`${SB}/auth/v1/token`, SB)).toBeNull();
  });

  it('leaves non-credential auth endpoints alone', () => {
    // /user (profile update), /logout — authenticated, not guessing surfaces.
    expect(rewriteAuthUrl(`${SB}/auth/v1/user`, SB)).toBeNull();
    expect(rewriteAuthUrl(`${SB}/auth/v1/logout`, SB)).toBeNull();
    expect(rewriteAuthUrl(`${SB}/auth/v1/authorize?provider=google`, SB)).toBeNull();
  });

  it('leaves PostgREST and realtime alone', () => {
    expect(rewriteAuthUrl(`${SB}/rest/v1/profiles?select=*`, SB)).toBeNull();
    expect(rewriteAuthUrl(`${SB}/realtime/v1/websocket`, SB)).toBeNull();
    expect(rewriteAuthUrl(`${SB}/storage/v1/object/avatars/x.png`, SB)).toBeNull();
  });

  it('never rewrites a different host', () => {
    // Guards against turning the proxy into a relay for somewhere else.
    expect(rewriteAuthUrl('https://evil.example.com/auth/v1/token?grant_type=password', SB)).toBeNull();
    expect(rewriteAuthUrl('https://api.pwnedpasswords.com/range/ABCDE', SB)).toBeNull();
  });

  it('is not fooled by a path that merely contains /auth/v1/', () => {
    expect(rewriteAuthUrl(`${SB}/rest/v1/x?next=/auth/v1/token`, SB)).toBeNull();
  });

  it('handles a trailing slash on the endpoint', () => {
    expect(rewriteAuthUrl(`${SB}/auth/v1/signup/`, SB)).toBe('/api/auth/signup');
  });

  it('returns null for unparseable input or missing config', () => {
    expect(rewriteAuthUrl('not a url', SB)).toBeNull();
    expect(rewriteAuthUrl(`${SB}/auth/v1/signup`, '')).toBeNull();
  });

  it('preserves the query string it forwards', () => {
    expect(rewriteAuthUrl(`${SB}/auth/v1/verify?token=abc&type=signup`, SB)).toBeNull(); // not proxied
    expect(rewriteAuthUrl(`${SB}/auth/v1/token?grant_type=password&redirect_to=%2F`, SB))
      .toBe('/api/auth/token?grant_type=password&redirect_to=%2F');
  });
});
