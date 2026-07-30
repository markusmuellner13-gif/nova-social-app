# Nova Brain

Nova's background intelligence: the part of the app that decides **what gets
into the database**, **what stays there**, and **what order you see it in** — and
that gets better at all three the more the app is used.

## What it is, honestly

Nova Brain is a **trained machine-learning system**, not a language model.

It is an **online logistic-regression ranker** that starts with all weights at
zero and learns them by gradient descent from real engagement, plus a quality
model and a source-reliability learner feeding the ingestion pipeline. Every
number in it is derived from observed behaviour.

It is **not** a GPT/Claude-style generative model, and it does not become one.
Training a language model needs a data centre and a corpus, not application
code — anyone claiming otherwise about a file like this is selling something.
What this *is*, is a real model that measurably improves its ordering with use,
runs in milliseconds, costs nothing per request, and needs no AI provider.

The app also ships `src/lib/novaBrain.ts`, a separate deterministic NLP layer
that answers chat questions from the events DB. Different thing, same
philosophy: real data, no paid model in the request path.

## The four parts

### 1. The ranker — `brain/ranker.ts`, `brain/features.ts`

Predicts *"will this person engage with this post?"* from 15 features:
proximity, imminence, whether the photo is real, whether it has a date, venue
and ticket link, whether it is free, title quality, caption richness, learned
source reliability, the user's category affinity, and time-of-day fit.

Training signal comes from what people actually do:

| Action | Label | Weight |
|---|---|---|
| impression (seen ≥1.2s, not acted on) | 0 | 0.06 |
| open | 1 | 0.5 |
| like | 1 | 1.0 |
| save | 1 | 1.2 |
| share | 1 | 1.2 |
| going | 1 | 1.5 |
| ticket click | 1 | 1.5 |
| hide | 0 | 1.5 |

The impression signal is what makes it discriminate: a model trained only on
likes learns that everything is good.

Two models cooperate:

- a **global** model in Redis, trained on everyone — good defaults from a new
  user's first session;
- a **personal** model in `localStorage`, trained only on this device, blended
  over the global one with a weight that grows as it sees more.

The personal model never leaves the device. The global model is trained from
**feature vectors only** — fifteen numbers, no post ids, no user ids, nothing
identifying. That is enough to learn ranking and useless for tracking anyone.

Ranking includes a **diversity guard** (max 3 in a row per category, so a
confident model can't collapse the feed into twenty restaurants) and an
**exploration term** (a small deterministic jitter, so the model keeps getting
signal about things it currently underrates instead of only confirming itself).

Until the model has seen 25 examples it returns the feed untouched — a fresh
install gets the server's soonest-first ordering, not the opinions of a model
that knows nothing.

### 2. The quality gate — `brain/quality.ts`

`eventValidation.ts` answers *"is this row structurally valid?"*. This answers
the question the app actually cares about: *"is this worth someone's screen?"*
A technically valid event with a stock photo, a six-word description and no
venue is real — and it is filler.

The bar **adapts to supply** (`qualityFloorFor`): a city with 200 candidates can
afford to be picky, a village with five cannot, and five honest mediocre
listings beat an empty feed. This is the guard that stops the quality gate from
quietly breaking small-town coverage.

### 3. The curator — `brain/curator.ts`

Runs inside the ingest cron, between validation and the database:

- **merges duplicates** — the same concert listed by two sources, or twice by
  one source under different ids. Matches on normalised title *plus* same date
  or a venue within 250 m, so a weekly event's separate dates stay separate.
- **drops filler** below the adaptive quality floor.
- **pre-warms images** for everything it accepts, so the first real visitor gets
  a cached render instead of paying for a cold resize.
- **reports per-source accept/drop**, which is the training signal for…

### 4. The source learner — `sourceStats.ts`

Running accept/reject statistics per source with decay, so the engine gradually
trusts the sources whose listings actually survive curation, and stops wasting
time on the ones that mostly return junk. Scored against what survives
**curation**, not merely validation — so a source that floods us with
valid-but-thin listings is scored down rather than rewarded for volume.

## Endpoints

| Route | Purpose |
|---|---|
| `GET /api/brain/feedback` | current shared weights, so the client can rank locally |
| `POST /api/brain/feedback` | anonymous feature vectors → trains the shared model |
| `GET /api/cron/brain` | maintenance + self-report (auth: `CRON_SECRET`) |

`/api/cron/brain` is the observability surface. It reports how many examples the
model has seen, **which features it has actually learned to care about** (sorted
by weight magnitude), learned per-source reliability, and the mean quality and
duplicate count of a live sample of the database. If the model drifts, that is
where you see it. It is chained from the warm cron because the Hobby plan caps
cron entries.

## Failure behaviour

Every layer is fail-soft, and this is deliberate:

- no Redis → no shared model; the personal model alone still ranks.
- no network → the personal model still trains and ranks locally.
- no `localStorage` → falls back to the global weights.
- neither → the feed is ordered exactly as it was before Nova Brain existed.

Nothing here can take the app down, and nothing here invents content. It only
ever reorders and filters what the real sources returned.

## Verifying it actually learns

`src/lib/brain/brain.test.ts` includes a test that trains the model on 150
examples of "engaged with cheap, close, imminent events" versus "ignored
distant, expensive, far-off ones" and asserts the trained model separates them
by more than 0.3 probability. If ranking ever stops working, that test is the
first place to look.

Run: `npx vitest run src/lib/brain`
