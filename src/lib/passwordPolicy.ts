// ─────────────────────────────────────────────────────────────────────────────
// Password policy.
//
// Before this, the only rule anywhere in Nova was the placeholder text
// "Password (min 6 chars)" — 6 being Supabase's default minimum. "password",
// "123456" and "nova123" were all accepted.
//
// IMPORTANT — where enforcement actually lives:
// This module runs in the browser, so it is UX, not a security boundary. Anyone
// can POST straight to Supabase's /auth/v1/signup and skip it entirely. The
// authoritative controls are the two Supabase dashboard settings documented in
// docs/AUTH_HARDENING.md (minimum length + required character classes, and
// leaked-password protection). This module exists so the two agree and the user
// gets an explanation instead of a bare 422 — not as the lock itself.
// ─────────────────────────────────────────────────────────────────────────────

export const MIN_PASSWORD_LENGTH = 12;

// bcrypt — which is what Supabase Auth hashes with — silently ignores every byte
// past the 72nd. A 100-character passphrase is therefore no stronger than its
// first 72 bytes, and a user who believes otherwise is mispriced on their own
// security. We refuse rather than truncate silently. Note this counts BYTES:
// emoji and accented characters cost 2–4 each.
export const MAX_PASSWORD_BYTES = 72;

export type PasswordVerdict = {
  ok: boolean;
  score: 0 | 1 | 2 | 3 | 4;   // drives the strength meter
  label: string;
  problems: string[];
  /** Set when the password should be rejected outright regardless of score. */
  blocking: boolean;
};

// The passwords that actually show up in credential-stuffing lists, plus the
// ones this app invites by name. Not a substitute for the breach check in
// /api/account/password-check — this is the instant, offline first pass.
const COMMON = new Set([
  '123456', '123456789', '12345678', '12345', '1234567', '1234567890',
  'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword',
  'qwerty', 'qwertyuiop', 'qwerty123', 'azerty', 'abc123', 'abcd1234',
  'iloveyou', 'admin', 'administrator', 'welcome', 'welcome1', 'welcome123',
  'monkey', 'dragon', 'letmein', 'football', 'baseball', 'sunshine', 'princess',
  'superman', 'batman', 'trustno1', 'master', 'shadow', 'michael', 'jennifer',
  'jordan', 'harley', 'ranger', 'hunter', 'buster', 'soccer', 'hockey',
  'killer', 'george', 'sexy', 'andrew', 'charlie', 'thomas', 'robert',
  'starwars', 'freedom', 'whatever', 'zaq12wsx', '1q2w3e4r', '1qaz2wsx',
  'qazwsx', 'asdfghjkl', 'zxcvbnm', '000000', '111111', '121212', '654321',
  'changeme', 'default', 'secret', 'test123', 'temp123', 'login',
  // app-specific: the names a Nova user is most likely to reach for
  'nova', 'nova123', 'novaapp', 'novapassword', 'nova2026', 'discover',
]);

const KEYBOARD_RUNS = [
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890',
  'abcdefghijklmnopqrstuvwxyz',
];

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Longest run of characters drawn consecutively from a keyboard/alphabet row. */
function longestSequentialRun(lower: string): number {
  let best = 0;
  for (const row of KEYBOARD_RUNS) {
    const rev = [...row].reverse().join('');
    for (const source of [row, rev]) {
      for (let i = 0; i < lower.length; i++) {
        let n = 0;
        while (
          i + n < lower.length &&
          source.includes(lower.slice(i, i + n + 1)) &&
          n < 12
        ) n++;
        if (n > best) best = n;
      }
    }
  }
  return best;
}

/** Strip a leading/trailing digit-and-symbol shell: "Password123!" → "password" */
function core(lower: string): string {
  return lower.replace(/^[^a-z]+/, '').replace(/[^a-z]+$/, '');
}

function looksLikeCommon(pw: string): boolean {
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) return true;
  // "Password123!" and "nova2026!" are the same idea wearing a hat.
  const stripped = core(lower);
  if (stripped.length >= 4 && COMMON.has(stripped)) return true;
  // leetspeak normalisation
  const deleet = lower
    .replace(/[@4]/g, 'a').replace(/[3]/g, 'e').replace(/[1!|]/g, 'i')
    .replace(/[0]/g, 'o').replace(/[$5]/g, 's').replace(/[7]/g, 't');
  return COMMON.has(deleet) || COMMON.has(core(deleet));
}

/**
 * Evaluate a candidate password. `identifiers` are things the password must not
 * simply repeat — the email and the chosen username.
 */
export function checkPassword(password: string, identifiers: string[] = []): PasswordVerdict {
  const problems: string[] = [];
  const pw = password ?? '';
  const lower = pw.toLowerCase();

  if (pw.length === 0) {
    return { ok: false, score: 0, label: '', problems: [], blocking: true };
  }

  // ── Hard rules ─────────────────────────────────────────────────────────────
  if (pw.length < MIN_PASSWORD_LENGTH) {
    problems.push(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (byteLength(pw) > MAX_PASSWORD_BYTES) {
    problems.push(`Too long — passwords are limited to ${MAX_PASSWORD_BYTES} bytes`);
  }
  if (/^\s|\s$/.test(pw)) {
    problems.push('Remove the leading or trailing space');
  }

  const classes =
    (/[a-z]/.test(pw) ? 1 : 0) +
    (/[A-Z]/.test(pw) ? 1 : 0) +
    (/[0-9]/.test(pw) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(pw) ? 1 : 0);

  // A long passphrase is strong without symbols, so the class rule relaxes with
  // length rather than demanding the "Xx1!" ritual that pushes people to reuse.
  const requiredClasses = pw.length >= 20 ? 1 : pw.length >= 16 ? 2 : 3;
  if (classes < requiredClasses) {
    problems.push(
      requiredClasses === 3
        ? 'Mix upper case, lower case and a number or symbol — or use a longer passphrase'
        : 'Add at least one more kind of character',
    );
  }

  if (looksLikeCommon(pw)) {
    problems.push('This is one of the most commonly used passwords');
  }

  const uniqueChars = new Set(pw).size;
  if (uniqueChars <= 3 && pw.length >= 6) {
    problems.push('Too repetitive');
  }
  if (/^(.+?)\1{2,}$/.test(pw)) {
    problems.push('Too repetitive');
  }

  const run = longestSequentialRun(lower);
  if (run >= 5) {
    problems.push('Avoid long keyboard runs like "qwerty" or "12345"');
  }

  for (const raw of identifiers) {
    const id = (raw ?? '').toLowerCase().trim();
    if (!id) continue;
    const localPart = id.split('@')[0];
    if (localPart.length >= 3 && lower.includes(localPart)) {
      problems.push('Do not reuse your email or username in the password');
      break;
    }
  }

  // ── Score (meter only; `ok` is decided by `problems`) ──────────────────────
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (classes >= 3)    score++;
  if (uniqueChars >= 10) score++;
  if (looksLikeCommon(pw) || run >= 5) score = 0;
  score = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4;

  const ok = problems.length === 0;
  if (!ok && score > 2) score = 2;

  const label = !ok
    ? (score <= 1 ? 'Weak' : 'Not strong enough')
    : score >= 4 ? 'Excellent' : score >= 3 ? 'Strong' : 'Good';

  return {
    ok,
    score: score as 0 | 1 | 2 | 3 | 4,
    label,
    problems: [...new Set(problems)],
    blocking: !ok,
  };
}
