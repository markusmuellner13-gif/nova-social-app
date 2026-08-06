# Auth hardening — passwords, usernames, and what's still on you

Audit date: **2026-08-06**. Supabase project `dilurtlmvnniunalnika`, 0 users at the
time of the audit — every change below landed before any real account existed, so
no user data had to be migrated.

---

## 1. What was actually broken

### Usernames were unique in the schema and broken in practice

`profiles.username` did carry a `UNIQUE` constraint. But the
`on_auth_user_created` trigger that was supposed to create the profile row —
written in `supabase-schema.sql` — **had never been applied to this project**.
Verified directly:

```sql
select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.relname = 'users';
-- (0 rows)
```

So profile creation happened only in the browser, in `AuthContext`'s
`upsertProfile`, whose entire error path was `console.error`. The consequence:

1. Sign up with a username someone already has.
2. `auth.users` row is created — **the signup succeeds**.
3. The profile `INSERT` fails with `23505` (unique violation).
4. The error is logged to a console nobody reads and thrown away.
5. You now have an account that can sign in but has **no profile, forever**.
   Every later sign-in retried the same doomed insert.

The same thing happened to two Google users whose email local-parts matched —
`markus@gmail.com` and `markus@outlook.com` both want `markus`.

Three further holes, all now closed:

| Hole | Why it mattered |
|---|---|
| Uniqueness was **case-sensitive** | `Markus` and `markus` were different rows |
| **No charset rule** | `mаrkus` with a Cyrillic `а` renders identically to `markus` — textbook homoglyph impersonation |
| **No reserved names** | Anyone could register `admin`, `support`, `nova`, `official` |

### Passwords had no policy at all

The only rule anywhere in the codebase was the placeholder string
`"Password (min 6 chars)"`. Six is Supabase's default minimum. `password`,
`123456` and `nova123` were all accepted, and there was **no password reset
flow** — a forgotten password meant a permanently unreachable account, which is
itself a pressure toward weak, memorable passwords.

---

## 2. What was fixed (done, verified)

**Migration `007_username_integrity.sql`** — applied to production and tested:

- `handle_new_user` trigger now creates the profile **in the same transaction as
  the `auth.users` insert**. An account without a profile is no longer
  representable.
- Collisions **resolve by suffixing** (`markus`, `markus.1`, `markus.2`) rather
  than failing. Failing here would roll back the signup itself; the form checks
  availability first, so suffixing is the rare race, not the normal path.
- `CHECK` constraint: 3–30 chars, `^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$`, no
  doubled separators. **ASCII-only is what kills the homoglyph attack** — a
  confusable character cannot be stored at all.
- `unique index on (lower(username))` — case-insensitive uniqueness.
- `reserved_usernames` table (RLS on, **zero policies**, so no client can read
  it). A reserved base does *not* get suffixed to `admin.1` — it falls back to a
  neutral id-derived name, because `admin.1` still reads as official.
- `username_available(text)` RPC for the signup form.
- **Usernames are immutable after creation** (`profiles_username_immutable`
  trigger). A handle that can be abandoned and re-registered is how
  impersonation-by-reuse works.

Verified against the live database — each of these was attempted and blocked:

| Test | Result |
|---|---|
| 3 users all requesting `markus` | `markus`, `markus.1`, `markus.2` — all got profiles |
| `Markus` vs `markus` | resolved to distinct names, no collision |
| Requesting `support` | fell back to `nova8bb1c9adc6` |
| `UPDATE profiles SET username=…` | `BLOCKED: username is immutable` |
| Inserting `BadName` (uppercase) | `BLOCKED: profiles_username_shape` |
| Inserting `mark..us` | `BLOCKED: profiles_username_shape` |
| Inserting `ab` (too short) | `BLOCKED: profiles_username_shape` |
| `sanitize_username('mаrkus')` (Cyrillic а) | → `mrkus` — cannot impersonate |

**Password policy** (`src/lib/passwordPolicy.ts`, 15 tests):

- Minimum **12** characters, up from 6.
- Character-class requirement that **relaxes with length** (3 classes under 16
  chars, 1 class at 20+). Forcing `Xx1!` on a passphrase is what drives reuse.
- Rejects common passwords including leetspeak and "wearing a hat" variants —
  `Password123!`, `P@ssw0rd`, `Nova2026!!`.
- Rejects keyboard runs, repetition, and any password containing the user's own
  email local-part or username.
- **Rejects passwords over 72 bytes rather than silently truncating.** bcrypt —
  which is what Supabase hashes with — ignores every byte past the 72nd, so a
  100-character passphrase is no stronger than its first 72. Counts *bytes*, so
  emoji and accents are charged correctly.

**Breach checking** (`src/lib/passwordBreach.ts` + `/api/pwned-range`):

Every new password is checked against Have I Been Pwned. **The password never
leaves the device** — the client SHA-1s it locally, sends only the first 5 hex
characters of the hash, and matches the returned suffixes itself (k-anonymity).
Verified against the live API: `password` returns 52,372,427 hits. Padding
decoys (returned with count `0`) are handled correctly. An HIBP outage returns
`unknown` and never blocks a signup.

This is the single highest-value password check there is — length and complexity
rules do nothing against credential stuffing, which replays passwords that are
already public.

**Password reset flow** — added (`/auth/reset`), since none existed. The reset
form applies the *same* policy and breach check as signup; a reset path with
weaker rules is just a way around the rules. The request form always shows the
same confirmation whether or not the account exists, so it can't be used as an
account-existence oracle.

---

## 3. What you still have to do — dashboard only

**This is the important section.** The password policy above runs in the browser,
which makes it UX, not a security boundary. Anyone can `POST` straight to
`https://dilurtlmvnniunalnika.supabase.co/auth/v1/signup` with `{"password":"123456"}`
and skip it entirely. **The authoritative controls are these dashboard settings,
and only you can change them** — they are not in code and not reachable via the
API keys available here.

### Required

1. **Authentication → Sign In / Providers → Minimum password length → `12`**
   Match `MIN_PASSWORD_LENGTH` in `src/lib/passwordPolicy.ts`. Without this the
   real floor is still 6.

2. **Authentication → Sign In / Providers → Password Requirements →**
   `Lowercase, uppercase, digits and symbols`

3. **Authentication → Attack Protection → Leaked password protection → Enable**
   This is Supabase's own server-side HIBP check. Our client-side one is a good
   experience; this one is the enforcement.

4. ~~**Attack Protection → CAPTCHA**~~ — **already on, confirmed 2026-08-06.**
   This was previously listed as the one item that couldn't be verified, because
   `/auth/v1/settings` doesn't expose captcha state. It got answered by accident
   while testing the auth proxy: a sign-in POST with no captcha token comes back

   ```
   400 {"error_code":"captcha_failed",
        "msg":"captcha protection: request disallowed (no captcha_token found)"}
   ```

   Supabase checks CAPTCHA *before* it checks the password, so every credential
   endpoint is gated. Nothing to do here.

### Recommended

5. **Authentication → Multi-Factor Authentication** — enable TOTP if you want
   real account security for the accounts that matter.

6. **Authentication → Rate Limits** — still worth lowering as defence in depth,
   though Nova now applies its own (see below).

---

## 3b. Login rate limiting

Nova's middleware used to cover `/api/feed` and `/api/admin` while the password
endpoint — the one thing actually worth brute-forcing — had no limit from us at
all, because supabase-js posts straight to `<project>.supabase.co` and
middleware never saw those requests.

`src/lib/authProxy.ts` installs a custom `fetch` on the Supabase client that
rewrites **only the credential-taking endpoints** (`token` with
`grant_type=password`, `signup`, `recover`, `otp`) onto `/api/auth/*`, which
middleware does see. `/api/auth/[...path]` forwards them to Supabase unchanged.

**Token refresh is deliberately NOT proxied.** It runs constantly for every
signed-in user, isn't a guessing surface, and rate limiting it would log people
out for using the app normally. Same for PostgREST, realtime, and the OAuth
redirect. A test asserts this specifically, because getting it wrong would be
subtle and horrible.

Two layers, doing different jobs:

| Layer | Limit | What it's for |
|---|---|---|
| middleware `login` tier | 20/min per IP | blunt volume control |
| per-account backoff in the route | 5 fails → 30s, 8 → 2m, 12 → 15m, 20 → 1h | the actual anti-stuffing control |

Per-IP alone is the wrong tool: too loose to stop a botnet spreading 5 guesses
across 10,000 addresses, too tight for carrier-grade NAT where thousands of real
users share one address. Per-account backoff tracks the thing being attacked
instead of the thing that's cheap to rotate.

**The lockout only counts genuine wrong-password answers.** This matters more
than it looks. Supabase checks CAPTCHA *before* credentials, so if CAPTCHA
failures counted, anyone could lock any user out of their own account by posting
that user's email with no captcha token — a free denial of service. Only
`invalid_credentials` counts; captcha/validation/throttling/upstream errors do
not, and a successful login clears the counter, so a typo earlier in the day
never accumulates. Signup/recover/otp get no per-account counter at all, for the
same reason — there is nothing to "get right" there, so a failure count keyed on
someone else's email would be a lockout weapon.

Identifiers are HMAC-hashed before they reach Redis: a rate-limit store
shouldn't double as a list of everyone who has tried to log in.

Trade-off worth knowing: Supabase now sees Vercel's egress IP for these four
endpoints rather than the user's, so its own per-IP limits are less useful on
them. The real client IP is forwarded in `X-Forwarded-For`, but Supabase may not
honour it. Nova's own two layers are the compensating control.

## 4. Residual risks, stated honestly

- **Every profile is publicly dumpable.** `profiles` has `SELECT using (true)`,
  so an anonymous caller holding the anon key (which ships in the client bundle,
  as it must) can page the entire user table via
  `GET /rest/v1/profiles?select=*` — usernames, display names, bios, avatars.
  Confirmed `http=200` against production. This is *arguably intended* for a
  public social app, and changing it would alter a core product behaviour, so it
  was left alone. But it is how scrapers build user lists, and it means username
  enumeration is free regardless of the availability RPC. If you ever want to
  narrow it, the move is a view exposing only the columns needed for search.

- **`username_available` is callable by anon.** Necessary — availability has to
  be checkable before an account exists. It adds no enumeration capability
  beyond the public `profiles` table above. It will show up in
  `get_advisors(security)` as an `anon_security_definer_function_executable`
  WARN, alongside `is_group_member` and `join_group_by_code`. Expected.

- **Email confirmation is on** (`mailer_autoconfirm: false`, verified), so an
  unconfirmed address can't be used. Good.

- **The client-side password policy can be bypassed** by talking to Supabase
  directly. Section 3 is the fix. Until those toggles are set, a determined user
  can still set a 6-character password on their own account.
