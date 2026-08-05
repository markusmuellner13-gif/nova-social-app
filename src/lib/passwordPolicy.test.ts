import { describe, it, expect } from 'vitest';
import { checkPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_BYTES } from './passwordPolicy';

describe('checkPassword', () => {
  it('rejects everything the old "min 6 chars" rule allowed', () => {
    // These were all valid Nova passwords before this policy existed.
    for (const pw of ['123456', 'nova12', 'abcdef', 'qwerty', 'password']) {
      expect(checkPassword(pw).ok, pw).toBe(false);
    }
  });

  it('enforces the minimum length', () => {
    const short = 'Ab3$xY9!zQ';           // 10 chars, all classes present
    expect(short.length).toBeLessThan(MIN_PASSWORD_LENGTH);
    expect(checkPassword(short).ok).toBe(false);
    expect(checkPassword(short).problems.join(' ')).toMatch(/at least/i);
  });

  it('accepts a strong mixed password', () => {
    const v = checkPassword('Tr4vel!Vienna#88');
    expect(v.ok).toBe(true);
    expect(v.score).toBeGreaterThanOrEqual(3);
  });

  it('accepts a long passphrase without demanding symbols', () => {
    // 20+ chars only needs one character class — length carries the entropy,
    // and forcing "Xx1!" on passphrases is what drives password reuse.
    const v = checkPassword('correcthorsebatterystaple');
    expect(v.ok).toBe(true);
  });

  it('still requires three classes at shorter lengths', () => {
    expect(checkPassword('alllowercasenos').ok).toBe(false); // 15 chars, 1 class
  });

  it('catches common passwords wearing a hat', () => {
    for (const pw of ['Password123!', 'P@ssw0rd1234', 'Welcome123456', 'Nova2026!!']) {
      expect(checkPassword(pw).ok, pw).toBe(false);
    }
  });

  it('catches leetspeak variants of common passwords', () => {
    expect(checkPassword('p@ssw0rd').ok).toBe(false);
    expect(checkPassword('l3tm31n12345').problems.length).toBeGreaterThan(0);
  });

  it('rejects long keyboard runs', () => {
    const v = checkPassword('Qwertyuiop123!');
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/keyboard runs/i);
  });

  it('rejects passwords built from the email or username', () => {
    const v = checkPassword('Markus!Markus99', ['markus@example.com', 'markus']);
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/email or username/i);
  });

  it('does not false-positive on a short identifier', () => {
    // A 2-char local part must not veto every password containing those letters.
    expect(checkPassword('Tr4vel!Vienna#88', ['ab@example.com', 'ab']).ok).toBe(true);
  });

  it('rejects repetition', () => {
    expect(checkPassword('aaaaaaaaaaaaaaa').ok).toBe(false);
    expect(checkPassword('abcabcabcabcabc').ok).toBe(false);
  });

  it('refuses passwords past bcrypt truncation rather than silently cutting them', () => {
    // bcrypt ignores everything past 72 bytes, so a longer password is not
    // actually stronger — say so instead of pretending.
    const v = checkPassword('A1!' + 'x'.repeat(MAX_PASSWORD_BYTES));
    expect(v.ok).toBe(false);
    expect(v.problems.join(' ')).toMatch(/bytes/i);
  });

  it('counts bytes, not characters, for the bcrypt limit', () => {
    // 40 emoji = 160 bytes, well past the limit despite being 40 "characters".
    const v = checkPassword('A1!' + '😀'.repeat(40));
    expect(v.problems.join(' ')).toMatch(/bytes/i);
  });

  it('flags surrounding whitespace', () => {
    expect(checkPassword(' Tr4vel!Vienna#88').problems.join(' ')).toMatch(/space/i);
  });

  it('returns a quiet, non-blocking verdict for an empty input', () => {
    const v = checkPassword('');
    expect(v.ok).toBe(false);
    expect(v.problems).toEqual([]);   // don't shout at someone who hasn't typed
    expect(v.label).toBe('');
  });
});
