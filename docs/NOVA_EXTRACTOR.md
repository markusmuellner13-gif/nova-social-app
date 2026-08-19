# Nova's adaptive extraction engine

`src/lib/brain/extractor/`

## What it is, stated honestly

The engine reads web pages and returns **records** — an activity, a museum, a
tour, a dated event — and it **learns new ways of reading** as it goes. When it
meets a site whose data format none of its built-in readers understand, it
studies the page, works out where the listings live and which key carries which
field, checks its answer against real rows, and if it holds up it **saves that
reader as a new skill for that host**. The next fetch of that site — by anyone,
in any request, including a cron run — uses the learned skill directly.

Skills are scored on every use. A skill that stops producing decays and is
eventually dropped, which is what makes a site redesign self-correcting.

What it is **not**: it is not an LLM, it does not become one, and it does not
"understand" a page the way a person does. It does not learn programming
languages. It learns **data formats and field vocabularies** by pattern
inference, and that is a genuinely different (and much cheaper, and much more
reliable) thing than prompting a model. No API key, no per-call credits.

## Why this exists

Nova's promise is real local content. The ceiling on that promise is how many
sites we can read. Hand-written readers cover the well-behaved web —
schema.org JSON-LD — and then stop dead at everything else, which is most of
the long tail: municipal museum sites, regional tourism boards, one-off
operator pages, anything built by an agency in 2019.

Rather than writing a reader per site forever, the engine writes them itself.

## The pipeline

```
 fetch html
     │
     ├─► harvest.ts      every JSON payload in the page
     │                   (ld+json · __NEXT_DATA__ · application/json · window.__NUXT__ …)
     │
     ├─► LEARNED SKILLS  this host's saved readers, best score first  ← fast path
     │
     ├─► dialects.ts     the built-in readers (schema.org, microdata, og:)
     │
     └─► learn.ts        only if the above came back thin:
                           enumerate every array-of-objects in the payloads
                           → infer.ts works out what its keys mean
                           → validate.ts decides whether the result is real
                           → best candidate above the bar is SAVED as a skill
```

Every step is bounded (payload size, tree depth, candidate count) and fail-soft.
A page that yields nothing is normal, not an error — the caller moves on to the
next source exactly as it always did.

## The interesting part: inferring an unfamiliar vocabulary

`infer.ts` decides which key carries which field using **the shape of the
values first, and the key's name only as a tie-breaker**.

If 70% of a column's values parse as ISO dates, that column is the start date —
whether it is called `startDate`, `fecha_inicio`, `開始日`, or `f_2`. If one
column's numbers all sit in [-90, 90] and a sibling's in [-180, 180], those are
coordinates, whatever they are named. A name hint table exists for the eight
languages Nova serves, but it can only **choose between candidates that already
passed the value test** — never promote one that failed. That ordering is what
stops a field called `title` that actually holds a UUID from winning `name` on
its name alone.

This is why the engine can read a site in a language nobody on the team speaks.

## Trust: why a learned skill can be believed

A wrong skill is worse than no skill, because it runs **first** on every future
fetch of that host. So the bar is deliberately high:

- the candidate array must have **≥3 rows** (2 rows cannot establish a schema)
- **≥50%** of those rows must produce a usable record
- mean record richness must clear **0.25** (`validate.ts`)
- a record needs a plausible name **plus at least one hard fact** — a date, a
  place, a link, or real prose. A name alone matches every link on the page.
- names that are navigation chrome ("Read more", "Privacy") or raw slugs
  (`summer-jazz-festival-2026`) are rejected outright

`learn.ts` also refuses to learn a second way to read JSON-LD, because the
built-in reader for it is better than anything inference would derive.

## Reinforcement

`skillStore.ts`, persisted in Redis under `nova:brain:skill:<host>` (30-day TTL,
max 5 skills per host, shared by every user and cron run).

- every use is a **trial**; a use that produced records is a **win**
- `score` is an EWMA (α = 0.3) of per-trial yield, so recent behaviour dominates
- a skill below **0.15** after **4+ trials** is dropped

Without Redis the engine still works — skills live in a process-local map for
the life of the instance. It degrades to "learns within a request", never to
"crashes".

## Where it runs

| Caller | What it adds |
|---|---|
| `src/lib/sources/webCrawler.ts` | Runs over the same HTML the crawler already fetched — no extra request. Adds microdata, learned readers, and learning on sites the JSON-LD path returns nothing for. |
| `src/lib/sources/activities.ts` | Reads each attraction's own page for ticket links, opening hours, price and duration. This is also where the engine meets the museum/operator long tail. |
| `/api/activities` | The Far Far Away tab's data. |

## Observing it

`GET /api/cron/brain` (auth: `CRON_SECRET` or `ADMIN_SECRET`) reports an
`extractor` block: how many hosts have learned skills, how many skills in total,
and the top 20 by score with their trial/win counts.

If a site redesigns, watch its skill's score fall there before anyone notices a
thin feed.

## Testing

`src/lib/brain/extractor/extractor.test.ts` (30 tests). The ones that matter
most:

- learns a reader for a Nuxt page with **German** keys no built-in can read,
  and re-applies it to a later page of the same site
- infers fields from **Spanish** keys and from **opaque** keys (`f_0`, `f_1`)
- **refuses** to learn from navigation chrome or name-only rows
- a learned skill survives a **JSON round trip** (it has to live in Redis)
- does not learn when the built-ins already did the job
- returns nothing rather than throwing on junk, and is depth-bounded against
  deeply nested state

`brain.test.ts` guards it as JOB 6 in the "Nova Brain still does every job"
block, so it cannot be added at the cost of the other five.
