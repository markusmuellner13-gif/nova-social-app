---
name: nova-sicherheit
description: Nova-spezifische Sicherheitsregeln und bewusste Ausnahmen. Verwenden zusammen mit app-sicherheit bei jeder Arbeit an Nova, die Login, Datenbank, API-Routen, Rate Limits, Kosten (Google Places, Anthropic, Vercel) oder Nutzerdaten berührt.
---

# Nova-Sicherheit

Ergänzt die allgemeinen Regeln aus dem Skill **app-sicherheit** um das, was nur für
Nova gilt. Wo eine allgemeine Regel und eine Ausnahme hier kollidieren, gilt die
Ausnahme hier – sie ist eine bewusste Produktentscheidung, kein Versehen.

Der Nutzer ist Einsteiger. Erkläre jede Sicherheitsänderung in einem einfachen Satz.

## Bewusste Ausnahmen – nicht "reparieren"

- **Viele API-Routen sind absichtlich ohne Login.** Feed, Karte, Explore, Far Far
  Away, Bild-Proxy und der KI-Chat müssen auch für Gäste funktionieren. Geschützt
  werden sie über Rate Limits (`middleware.ts`) und Tagesbudgets, nicht über Login.
  Login-Pflicht gilt nur für Routen, die Daten eines bestimmten Nutzers lesen oder
  ändern (z. B. `/api/account/*`).
- **Der KI-Chat (`/api/chat`) ist für Gäste offen.** Ihn begrenzen: 20/min pro IP
  (Tier `ai`) und das tägliche Dollar-Budget (`AI_DAILY_BUDGET_USD`). Kein
  Login-Zwang einbauen, ohne den Nutzer zu fragen.
- **Die Content-Security-Policy steht in `middleware.ts`, nicht in `next.config.ts`.**
  Sie braucht pro Seitenaufruf eine neue Nonce. Nie eine zweite CSP in
  `next.config.ts` setzen – sie würde die strenge überschreiben. Die übrigen
  Header (X-Frame-Options, HSTS, …) bleiben in `next.config.ts`.
- **Profile sind öffentlich lesbar** (Produktentscheidung). Darum darf `profiles`
  nie E-Mail-Adressen oder andere private Felder enthalten.
- **Zod ist nicht installiert.** Eingaben werden von Hand geprüft (siehe
  `sanitize*`-Funktionen). Neue Prüfungen im selben Stil schreiben oder den Nutzer
  fragen, bevor Zod als neue Abhängigkeit dazukommt.

## Wo Nova sich schützt

- **Rate Limits pro IP:** `middleware.ts` (Upstash Redis, Tiers `auth` 5, `login` 20,
  `ai` 20, `write` 15, `read` 60, `asset` 600 pro Minute). Vercel überschreibt
  `X-Forwarded-For` – IP-Fälschung umgeht die Limits nicht (getestet 2026-10-05).
- **Das Middleware-Limit schützt NUR Novas eigene `/api/*`-Routen.** Die Supabase-
  REST-API ist mit dem öffentlichen Anon-Key direkt erreichbar. Grenzen, die
  immer gelten müssen, gehören in die Datenbank: RLS-Policies, Längen-CHECKs und
  der Trigger `enforce_user_write_rate` (Migration `009_abuse_limits.sql`, in Produktion seit 2026-10-05).
  Jede neue Tabelle, in die Nutzer schreiben, bekommt RLS, Längen-CHECKs und
  diesen Trigger.
- **Login-Versuche:** zusätzlich Sperre pro Konto mit wachsender Wartezeit
  (`src/app/api/auth/[...path]/route.ts`, getestet in `src/lib/authLockout.test.ts`),
  Supabase-CAPTCHA (Turnstile) ist an.
- **Bild-Proxy (`/api/image-proxy`):** nur Parameter `url` und `w`, SSRF-Prüfung
  bei jedem Redirect, eigenes Render-Limit pro IP und pro Tag.
- **Push-Abos:** nur echte Push-Dienste als Ziel (`src/lib/pushSubscription.ts`),
  `userId` nur aus einem verifizierten Login-Token (`verifiedUserId`).
- **Service-Role-Key:** nur serverseitig, nur in `src/lib/*` und API-Routen. Wer
  damit Daten eines Nutzers liest (umgeht RLS!), holt die User-ID aus
  `verifiedUserId()`, niemals aus dem Request-Body.

## Kosten-Grenzen (nie entfernen, nur bewusst anheben)

- **Google Places:** `PLACES_DAILY_BUDGET` = 100 Foto-Downloads/Tag. Nur der
  Download kostet; Suche und Details laufen über die kostenlosen IDs-only-SKUs.
  Nie `places.photos` in eine Text-Search-Feldmaske schreiben – das ist der
  teure Pro-SKU.
- **Anthropic:** `AI_DAILY_BUDGET_USD` = 0,50 $/Tag, gemessen an der echten
  `usage` jeder Antwort. Jeder neue Claude-Aufruf läuft über `callClaude` in
  `src/lib/sources/claudeAI.ts` (oder prüft `aiSpendExceeded`/`recordAiSpend`
  selbst), sonst umgeht er das Budget.
- **Externe Gratis-Dienste** (Nominatim, Overpass) haben eigene Nutzungsregeln.
  Server-Aufrufe brauchen eine app-weite Obergrenze, sonst droht eine Sperre für
  alle Nutzer (Beispiel: `/api/geocode`, 50/min).
- Bei jedem neuen bezahlten Dienst: Tageslimit im Code UND ein hartes Limit im
  Dashboard des Anbieters vorschlagen.

## Vor jedem Merge

- `npx tsc --noEmit`, `npx vitest run`, `npx eslint .` (Basis: 0 Fehler, 41 Warnungen).
- Nach Datenbank-Änderungen die Supabase-Advisors prüfen. Bekannt und unkritisch:
  `handle_new_user` / `prevent_username_change` / `enforce_user_write_rate` (Trigger-Funktionen, nicht direkt
  aufrufbar) und `username_available` (absichtlich öffentlich für die Registrierung).
- Migrationen nie ungefragt auf die Produktionsdatenbank anwenden.
