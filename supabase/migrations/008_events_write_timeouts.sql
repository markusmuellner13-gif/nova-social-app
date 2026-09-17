-- APPLIED to the nova project (dilurtlmvnniunalnika) on 2026-09-18 and verified:
--   service_role rolconfig = {statement_timeout=20s,lock_timeout=5s,
--                             idle_in_transaction_session_timeout=30s}
-- ─────────────────────────────────────────────────────────────────────────────
-- Give the ingestion role timeouts, so a stuck write fails fast instead of
-- hanging until the gateway gives up.
--
-- CONTEXT: between Sept 8 and 14, 2026, ten ingest slices logged
--   [eventsDb/upsert] Gateway Timeout
-- on /api/cron/ingest, and a slice that cannot return gives the GitHub workflow
-- no `nextOffset` — so the chain stops and the run goes red.
--
-- WHAT IT WAS NOT: the statement. pg_stat_statements (unreset since 2026-06-06,
-- so it covers the whole window) has the events upsert at 60,334 calls, mean
-- 32ms, MAX 583ms. A lock wait counts as execution time, so if these had been
-- blocked on locks it would show here. It does not. The writes never struggled —
-- they queued in front of Postgres, at PostgREST's connection pool, behind the
-- app's own request volume (the expired-row purge alone ran 23,359 times).
--
-- The real fix is in the app: fewer requests, smaller requests, and a client-side
-- timeout so a queued write can no longer hold a Vercel function to its 60s cap.
-- See src/lib/eventsDb.ts.
--
-- WHAT THIS IS: the backstop. `service_role` is the one role on this project
-- with no limits at all —
--
--   anon           statement_timeout=3s
--   authenticated  statement_timeout=8s
--   authenticator  statement_timeout=8s, lock_timeout=8s
--   service_role   (nothing)
--
-- — so a service-role statement that ever DOES block has nothing to stop it.
-- These bounds make that case fail in seconds, where the app retries it, instead
-- of silently consuming a function's entire lifetime.
--
-- The values are generous on purpose: a 25-row upsert into this table takes tens
-- of milliseconds, and the slowest service-role statement on record is 583ms, so
-- nothing that works today starts failing. If you later add a deliberately long
-- service-role job (a bulk backfill, say), raise it for that session with
-- `set local statement_timeout` rather than loosening it here.
--
-- Safe to re-run. Applies to NEW connections, so give PostgREST a few minutes
-- (or restart the project) before expecting it to take effect.
--
-- To undo:
--   alter role service_role reset statement_timeout;
--   alter role service_role reset lock_timeout;
--   alter role service_role reset idle_in_transaction_session_timeout;
-- ─────────────────────────────────────────────────────────────────────────────

alter role service_role set statement_timeout = '20s';
alter role service_role set lock_timeout      = '5s';

-- Keeps a stalled transaction from pinning a pool connection it is not using.
alter role service_role set idle_in_transaction_session_timeout = '30s';

-- Verify:
--   select rolname, rolconfig from pg_roles where rolname = 'service_role';
-- Expected: {statement_timeout=20s,lock_timeout=5s,idle_in_transaction_session_timeout=30s}
