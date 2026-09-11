# VAYA — Operations Runbook

For whoever is on call. Assumes no prior context beyond "something might be wrong with VAYA." Every command/endpoint referenced here is real and exists in this repo as of 2026-09-10 — see `PRODUCTION_READINESS.md` for how each piece was verified and `LAUNCH_ACTIONS.md` for what still needs real infrastructure before any of this is live.

---

## 1. System at a glance

- **API**: Fastify, `apps/api` — stateless, horizontally scalable, talks to Postgres + Redis.
- **Worker**: `apps/api/src/worker.ts` — one BullMQ queue (`notification-dispatch`), one process, four job types (push/email dispatch, recurring-pattern scan, trip-staleness sweep, booking-expiry sweep). Not horizontally scaled by default — running two instances is safe (BullMQ handles concurrent consumers of the same queue) but not necessary unless job volume actually demands it.
- **Database**: Postgres 16 + PostGIS extension. Migrations via `drizzle-kit`, journaled in `apps/api/drizzle/meta/_journal.json`.
- **Redis**: caching, rate-limit backing, BullMQ queue storage. The app degrades (not crashes) without it — see §3.
- **Mobile**: Expo/React Native, talks to the API only via `API_BASE_URL`.
- **Admin**: a Vite SPA (`apps/admin`), talks to the same API under `/api/v1/admin/*`.

## 2. Health & diagnostics — check these first, in this order

1. **`GET {API_BASE_URL}/api/v1/health`** — the single most useful endpoint. Returns `200` with `{"status":"ok", "checks": {"database": {...}, "redis": {...}}}` when healthy, `503` with the same shape (showing which dependency is unhealthy) otherwise. Start here for any "is it down" question.
2. **`GET {API_BASE_URL}/metrics`** — Prometheus-format. `http_requests_total`/`http_request_duration_seconds` (labeled by route/method/status) for traffic and latency; default Node process metrics (`process_resident_memory_bytes`, event-loop lag) for resource exhaustion. If you have Grafana/Prometheus scraping this, check it before SSHing anywhere.
3. **Sentry** (if `SENTRY_DSN` is configured — see LAUNCH_ACTIONS.md) — the API and mobile app both report unhandled exceptions here (`apps/api/src/config/monitoring.ts`, `apps/mobile/src/services/monitoring/sentry.ts`). Check for a spike in a specific error before assuming "everything is broken."
4. **`GET {API_BASE_URL}/api/v1/admin/queue/failed`** (requires an admin token) — or the admin app's **Background Jobs** page. Shows failed notification-dispatch/recurring-scan/staleness-sweep jobs with their failure reason, without needing Redis CLI access. A growing failed-job count with the same `failedReason` usually means a downstream provider (Expo push, Resend, Twilio) is down.
5. **Smoke test**: `API_BASE_URL=https://<real-url> pnpm --filter @vaya/e2e smoke` (`tests/e2e/tests/smoke.api.test.ts`) — read-only, safe to run against production at any time. Confirms health, `/metrics`, the OpenAPI spec, auth rejection, and 404 handling all work as a single pass/fail signal.

**If none of the above suggest a problem but users are still reporting issues**, check:
- The mobile app's actual `API_BASE_URL` for the build in question (EAS dashboard → environment variables for that build profile) — a build pointed at the wrong backend looks like "everything is broken" to that specific build's users only.
- Whether the issue is provider-specific: Twilio (OTP/SMS), Expo push, Resend (email), Google Maps/Places/Routes, S3 — each has its own outage page; a `checkTwilio`/`checkS3`-style failure only shows up in `pnpm --filter @vaya/api preflight`, not `/health`.

## 3. Common incidents & response

**Database unreachable** (`/health`'s `checks.database.status === 'unhealthy'`)
- Confirm the managed Postgres provider's own status page first.
- Check connection pool exhaustion: the API uses a single `pg.Pool` per process (`apps/api/src/lib/database.ts`) — if many replicas exist, total connections can exceed the DB's `max_connections`. There's no PgBouncer/connection-pooler in front of Postgres in this repo as of 2026-09-10 (a real SCALE-phase gap if replica count grows — see `docs/architecture/overview.md`).
- The app does **not** crash on a DB outage — requests fail with 500s and `/health` reports `unhealthy`, but the process stays up and recovers automatically once the DB is reachable again (no restart needed).

**Redis unreachable**
- Degrades gracefully, does not crash: caching, rate-limit backing, and BullMQ (queue jobs — pushes/emails/recurring-scan/staleness-sweep) all stop working, but core booking/matching/auth flows keep working (rate limiting falls back to in-memory per-process, per `@fastify/rate-limit`'s default). `/health`'s `checks.redis.status` becomes `unhealthy`.
- **Consequence that's easy to miss**: no push notifications or emails will send while Redis is down, silently. Nothing pages on this by itself — `/health` going red is the only signal.

**Worker process not processing jobs**
- Check `GET /api/v1/admin/queue/failed` for a growing count, or the worker's own heartbeat: `docker/worker.Dockerfile`'s `HEALTHCHECK` (a file at `/tmp/worker-heartbeat` written every 15s) fails if the process is alive but wedged — `docker inspect <container> --format='{{.State.Health.Status}}'` shows this without needing app-level access.
- The worker has graceful shutdown (drains in-flight jobs on `SIGTERM`) — a rolling restart is safe, no special drain procedure needed.

**OTP/phone sign-in not working for users**
- Confirm `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER` are actually set in the running environment — the app **refuses to boot in production** without them (`apps/api/src/config/env.ts`'s `assertProductionSafe`), so if it's running at all in `NODE_ENV=production`, they're set; but run `pnpm --filter @vaya/api preflight` to verify Twilio actually accepts the credentials (not just that they're present) and check Twilio's own console for delivery failures/account issues.

**KYC document upload / avatar photos failing or vanishing**
- Confirm `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` — same boot-refusal guarantee as Twilio above. `pnpm --filter @vaya/api preflight` does a real `HeadBucket` call to confirm the bucket is actually reachable with these credentials, not just present.

**A specific endpoint is slow/erroring**
- Check `/metrics`'s `http_request_duration_seconds` histogram for that route (labeled by the parameterized route pattern, e.g. `/api/v1/matching/search`, not the raw URL).
- The matching/pricing/geospatial endpoints are the ones `docs/architecture/overview.md` itself flags as highest-value to watch for latency regressions.

**A deploy just went out and something looks wrong**
- See §5 (rollback) — don't try to "fix forward" under pressure; roll back first, diagnose after.

## 4. Deployment procedure

1. CI (`.github/workflows/ci.yml`) must be green on the commit being deployed — it runs lint/typecheck/test/build against real Postgres+Redis service containers, `verify-migrations` (catches an unjournaled-migration bug before it ships), and builds both Docker images.
2. **Migrations first, separately, before the new app revision deploys**: `pnpm --filter @vaya/api db:migrate` against the production `DATABASE_URL`, from CI or a trusted deploy host — never from inside the running container (`docker/api.Dockerfile`'s own comment explains why: N replicas must not race N concurrent `drizzle-kit migrate` runs).
3. Build (or pull, if CI already pushed them to a registry) the two images: `docker build -f docker/api.Dockerfile -t vaya-api:<tag> .` and `docker build -f docker/worker.Dockerfile -t vaya-worker:<tag> .`.
4. Deploy. Both images have a `HEALTHCHECK` — wait for it to report healthy before routing real traffic (whatever orchestrator is chosen should already gate on this).
5. **Run the smoke test against the newly-deployed environment**: `API_BASE_URL=<real-url> pnpm --filter @vaya/e2e smoke`. This is the actual "done" signal for a deploy — a green CI run and a healthy container prove the build works, not that the deployed environment is correctly wired (real env vars, real DB migrated, real network path).
6. Watch `/metrics` and Sentry for 10-15 minutes post-deploy before considering it fully done.

## 5. Rollback procedure

- **Application code**: redeploy the previous image tag. Both Dockerfiles produce a single self-contained image (no external state baked in beyond what env vars provide), so this is safe and fast — whatever orchestrator is chosen needs to keep the previous tag addressable (not garbage-collected immediately).
- **Database migrations**: this repo's migrations are additive-only by explicit convention (`CLAUDE.md`'s "Things that must NOT be changed casually" — no destructive migration has ever shipped). This means an application rollback to a previous code revision is almost always compatible with the current (newer) schema without a DB rollback — old code simply doesn't read the new columns/tables. If a migration genuinely needs reverting (should be rare), write a new additive migration that undoes the effect (e.g., a new column not the dropped old one) rather than running any migration backward — this repo has no tooling for backward migration and building it under incident pressure is worse than a forward-fixing migration.
- **A stuck/wedged worker**: safe to kill and restart at any time (graceful shutdown drains in-flight jobs; BullMQ's own stalled-job recovery reclaims anything genuinely lost).

## 6. Diagnosing without deep access

Everything in §2 is designed to be checkable with only an HTTP client (curl/browser) and, for the admin-gated endpoints, an admin login — no SSH, no direct DB/Redis access required for the common cases. Direct DB/Redis access should only be needed for:
- Inspecting BullMQ's raw Redis state beyond what `/admin/queue/failed` surfaces (rare — that endpoint covers the common "what's failing and why" case).
- A genuinely novel data-integrity question the audit/query tools above don't answer.

## 7. Known gaps in this runbook (honest, not filled with guesses)

- **No alerting is wired up.** Nothing pages a human automatically when `/health` goes red or the failed-job count spikes — someone has to be watching `/metrics`/Sentry/the admin panel. Setting up real alerting (Sentry alert rules, an uptime check on `/health`) is a concrete `LAUNCH_ACTIONS.md` item, not yet done.
- **No on-call rotation or escalation path is defined** — this repo has no organizational information to define one; whoever owns this product needs to add that.
- **No documented DB restore procedure** — because no backup strategy exists yet either (see `PRODUCTION_READINESS.md`/`LAUNCH_ACTIONS.md`). Do not assume backups exist without confirming with whoever provisioned the production database.
