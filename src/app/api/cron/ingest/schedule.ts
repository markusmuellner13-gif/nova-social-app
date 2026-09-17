// Which cron schedule means which freshness tier.
//
// A Vercel cron can only call a plain path — the docs show no supported way to
// attach a query string, and guessing at undocumented behaviour in production
// config is how you end up with a schedule that silently does the wrong thing.
// So both ingest schedules share one path and identify themselves with the
// documented `x-vercel-cron-schedule` header, which carries the cron expression
// that fired.
//
// This lives beside route.ts rather than inside it because Next.js validates the
// exports of a route file, and this is configuration, not a route handler.
// Keep the map in sync with the `crons` array in vercel.json — there is a test
// (schedule.test.ts) that reads the real file and fails if they drift apart.

const CRON_SCHEDULE_TIERS: Record<string, string> = {
  // The time-sensitive categories: concerts, club nights, matches, exhibitions.
  '*/10 * * * *': 'fast',
};

/**
 * The tier a cron schedule asks for, or null for the full catalogue.
 *
 * Unknown schedules deliberately fall back to the full sweep: editing
 * vercel.json without touching this map then degrades to "sweeps everything,
 * less often" rather than to "sweeps nothing".
 */
export function scheduleTier(schedule: string | null): string | null {
  if (!schedule) return null;
  return CRON_SCHEDULE_TIERS[schedule.trim()] ?? null;
}
