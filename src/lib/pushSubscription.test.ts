import { describe, it, expect } from 'vitest';
import { sanitizeWebSubscription } from './pushSubscription';

const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };

describe('sanitizeWebSubscription', () => {
  it('keeps a real subscription from each browser push service', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc123',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QGuQyavXutnMH',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) {
      expect(sanitizeWebSubscription({ endpoint, expirationTime: null, keys })?.endpoint).toBe(endpoint);
    }
  });

  it('refuses an endpoint that is not a push service — the cron would POST to it', () => {
    expect(sanitizeWebSubscription({ endpoint: 'https://evil.example.com/collect', keys })).toBeNull();
    expect(sanitizeWebSubscription({ endpoint: 'https://fcm.googleapis.com.evil.example/x', keys })).toBeNull();
    expect(sanitizeWebSubscription({ endpoint: 'http://fcm.googleapis.com/fcm/send/abc', keys })).toBeNull();
    expect(sanitizeWebSubscription({ endpoint: 'https://169.254.169.254/latest', keys })).toBeNull();
  });

  it('drops extra fields and refuses oversized or missing keys', () => {
    const out = sanitizeWebSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/a', keys, junk: 'x'.repeat(1e6) });
    expect(out).toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/a', expirationTime: null, keys });
    expect(sanitizeWebSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/a', keys: { ...keys, auth: 'x'.repeat(500) } })).toBeNull();
    expect(sanitizeWebSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/a' })).toBeNull();
    expect(sanitizeWebSubscription('nope')).toBeNull();
  });
});
