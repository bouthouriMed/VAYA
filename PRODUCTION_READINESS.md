# VAYA — Production Readiness Audit

**Audit date:** 2026-09-10 (two passes, same day)
**Scope:** Full repository — backend (`apps/api`), mobile (`apps/mobile`), admin (`apps/admin`), shared packages, infrastructure, docs.
**Method:** Pass 1: direct code inspection + 5 parallel deep-dive audits (security/authz, infrastructure/deployment, mobile release-engineering, external services, observability), cross-verified against each other and against actually running the code — not against CLAUDE.md's own self-reported changelog, which this audit treated as a claim to verify, not a fact. Pass 2: implemented every remaining P1/P2 finding from pass 1 that was completable without real credentials, external accounts, legal decisions, or a physical device — see §11.

**Companion documents**: `LAUNCH_ACTIONS.md` (the precise external-action checklist — everything in this file that needs a human with real credentials to complete) and `RUNBOOK.md` (operations — health checks, incident response, deploy/rollback procedure), both new in pass 2.

---

## 1. Executive summary

VAYA's *application logic* is genuinely mature: a real OSRM/Google routing foundation, a sophisticated matching engine, a well-modeled domain layer, and a large, mostly-passing test suite. But this audit found the codebase had **never actually been deployed, and could not have been** — the documented production start command (`node dist/server.js`) crashes immediately on boot, there was no CI pipeline of any kind, three separate "provider" abstractions (SMS, file storage, error tracking) were hardcoded to dev-only stubs with no way to activate a real backend, and a hardcoded insecure JWT secret would have let anyone forge admin tokens against a misconfigured deploy. None of this was visible from reading the code casually — it only surfaces when you actually try to run what's documented, which is what this audit did.

**12 P0 (launch-blocking) issues were found; 9 were fixed in pass 1.** The remaining P0s require real infrastructure, real credentials, or legal/product decisions that cannot be manufactured in a sandboxed audit — see `LAUNCH_ACTIONS.md` for the exact, precise list of what a human still needs to do, and why. Every fix was verified by actually running the affected code path — typecheck, lint, the full test suite, and, for the most critical findings, by booting the real server process and hitting real HTTP endpoints — not just by reading the diff.

**Pass 2 then implemented every remaining P1/P2 finding that was completable without real credentials, external accounts, legal decisions, or a physical device** — 15 further items, detailed in §11: a migration-safety check (the exact class of bug pass 1 found, now caught automatically in CI going forward), hardened CI (Docker image builds now run for real on every push, Dependabot, a dependency audit step), a tightened OAuth redirect allowlist, admin-session hardening (shorter token TTL + a real CSP), mobile crash reporting (Sentry, safely gated), a real `/metrics` endpoint, RTK Query retry/timeout + an offline banner, Docker healthchecks + a production-like compose file, admin-visible background-job failure inspection (previously Redis-CLI-only), a real on-brand app icon/splash (previously Expo's default placeholder), a pre-deploy `preflight` check script, a safe-to-run-against-production smoke test, consolidated/redacting logging, and a config-drift cleanup. 16 new automated tests back these changes; the full suite was re-run and diffed against the pass-1 baseline with zero regressions.

**Verdict: CONDITIONAL GO — unchanged from pass 1's engineering conclusion, now with a materially shorter and more precise external-action list.** See §10 and `LAUNCH_ACTIONS.md`.

---

## 2. Complete audit areas

| Area | Covered | Method |
|---|---|---|
| Production infra (backend/workers/DB/Redis/storage/domains/HTTPS/DNS) | Yes | Direct inspection + live boot test |
| Environment config & secrets | Yes | Direct inspection + fix |
| Dev/staging/prod separation | Yes | Direct inspection |
| Migrations, indexes, constraints, seed data | Yes | Direct inspection + fix (found and fixed a real broken migration) |
| Backups / restore verification | Yes (found: absent) | Repo-wide search |
| Health checks, graceful shutdown, retries, queues | Yes | Direct inspection + fix |
| Core product journeys (search/match/publish/book/cancel/no-show) | Yes | Subagent deep-dive; not re-litigated, no new gaps found beyond what CLAUDE.md already discloses |
| Location/routing/tracking | Yes | Subagent deep-dive |
| Notifications & push tokens | Yes | Subagent deep-dive |
| Auth/OAuth/sessions/account lifecycle | Yes | Subagent deep-dive + fix |
| Admin/ops/trust & safety | Yes | Subagent deep-dive + fix (authz gap) |
| API authorization/IDOR | Yes | Subagent deep-dive (clean — see §3) |
| Input validation, rate limiting, abuse protection | Yes | Subagent deep-dive + fix |
| Secrets exposure | Yes | Repo-wide grep — clean, no hardcoded real secrets found |
| GDPR/privacy (consent, deletion, export, retention) | Yes (found: absent) | Direct inspection |
| Mobile production config (iOS/Android, signing, permissions) | Yes | Subagent deep-dive + fix |
| Deep links, offline behavior, crash handling | Yes | Subagent deep-dive + fix (1 of 2) |
| External services (Maps, OAuth, SMS, push, email, storage) | Yes | Subagent deep-dive + fix |
| Quality (tests/typecheck/lint/build) | Yes | Actually run, repeatedly, before and after every fix |
| Observability (logging, error monitoring, metrics, alerts, audit logs) | Yes | Subagent deep-dive + fix (partial) |
| Store & launch readiness (bundle IDs, signing, ToS/Privacy) | Yes (found: ToS/Privacy absent) | Direct inspection |
| Repo hygiene (debug code, secrets, CI/CD, reproducible builds) | Yes | Direct inspection + fix |

---

## 3. Issues discovered

### P0 — Launch blockers

1. **The documented production start command is completely broken.** `node dist/server.js` (and `node dist/worker.js`) crash immediately with `ERR_MODULE_NOT_FOUND` — `apps/api`'s relative imports omit `.js` extensions (valid for the `bundler` moduleResolution used everywhere else, invalid for plain Node ESM), and the workspace packages it depends on (`@vaya/config`/`@vaya/domain`/`@vaya/validation`) are consumed as raw, uncompiled TypeScript source with no build step at all. **This means the application, as documented, could never have run in production.** Verified by actually running both compiled entry points and watching them crash, then verifying the fix (see §5).
2. **`JWT_SECRET` had a hardcoded insecure default** (`'dev-insecure-jwt-secret-change-in-production'`) with no production-time check that it had been overridden. Anyone reading the (public) source could forge a valid access token for any user — or, worse, a `role: 'superadmin'` admin token — against any deploy that forgot to set the real env var.
3. **SMS/OTP delivery had no real provider at all.** `getSmsProvider()` was hardcoded to always return `DevSmsProvider`, which only logs the phone number and OTP code — no env branch, no way to activate a real provider existed anywhere in the code. Phone/OTP is this app's *default* sign-in path (Google is the only alternative). In production this means **no user could ever complete phone sign-in**, and anyone with log access could read any user's live OTP.
4. **File storage (KYC documents, avatars) had no real provider at all.** `getStorage()` was hardcoded to `LocalDiskStorageAdapter`, which writes to the API container's own local filesystem. On any ephemeral/container-based production deploy (the standard pattern for a Fastify API), **every KYC document and photo uploaded is permanently lost on the next redeploy or restart** — directly breaking the driver-verification pipeline this product's docs call out as its core differentiator.
5. **No CI/CD pipeline existed at all** — no `.github/workflows`, no equivalent anywhere. Nothing enforced `pnpm lint`/`typecheck`/`test` before merge. This is not hypothetical: it is very likely *why* two other real, independent bugs (below) went undetected.
6. **A real, silently-broken database migration.** `apps/api/drizzle/0019_silent_crystal.sql` (`ALTER TYPE notification_event_type ADD VALUE 'rating_received'`) existed on disk but was **never registered in `_journal.json`**, so `drizzle-kit migrate` would never apply it — while the application code (`ratings.service.ts`, `notifications.service.ts`) already unconditionally inserts notifications with `event_type = 'rating_received'`. On any freshly-migrated production database, the first rating submitted would throw a raw Postgres `invalid input value for enum` error.
7. **`DEFAULT_LOCALE` was `'en'`, its own test asserted `'fr'`, and the test was failing** — undetected because nothing ran it (see #5). VAYA is a Tunisia-market product; French, not English, is the correct fallback UI language and OTP/system-message language for a device locale this app doesn't otherwise recognize.
8. **No Terms of Service or Privacy Policy exists anywhere in the repo** — not as a document, not as a hosted URL. A static, unlinked disclaimer string ("By continuing, you accept VAYA's Terms of Use and Privacy Policy") is shown on the sign-in screen, but it links to nothing, and no such document exists. **Both the Apple App Store and Google Play require a real, reachable Privacy Policy URL to submit an app; neither store submission is possible without one.** This needs a human/legal author — not something an audit should fabricate.
9. **No account-deletion or data-export mechanism exists.** No `DELETE /users/me` or equivalent endpoint anywhere in the API. GDPR's right to erasure/portability has no technical mechanism to fulfill it. This needs deliberate product/data-retention design (what "delete" means against bookings/ratings/financial-adjacent records that a counterparty still has a legitimate claim to) — not a rushed bolt-on; flagged, not implemented.
10. **Admin `role` (`admin` vs `superadmin`) was issued in every token but never checked anywhere** — every route behind `authenticateAdmin` (including platform-wide pricing/matching config and account suspension) was reachable by any admin account regardless of role.
11. **iOS's ATS exception (`NSAllowsArbitraryLoads: true`) was unconditional**, shipping to a real production build too — disabling HTTPS enforcement app-wide (any embedded content, not just the API), permanently, regardless of whether the backend ever gets real HTTPS.
12. **No backup/restore strategy exists anywhere** — documented, automated, or otherwise. For a marketplace holding booking/trust data, this is unverified-to-the-point-of-absent.

### P1 — Serious production risks

13. Rate limiting is keyed by `request.ip` under `trustProxy: true` with no restriction — a caller can spoof `X-Forwarded-For` to reset any IP-keyed limit, including OTP request/verify and admin login.
14. `/auth/otp/verify` had **no dedicated rate limit at all** (only the generic 100/min global default) — a 6-digit code brute-force surface.
15. `worker.ts` (the BullMQ background worker) had no graceful-shutdown handler — a container `SIGTERM` killed it mid-job with no drain, unlike `server.ts`, which already had one.
16. No `uncaughtException`/`unhandledRejection` handlers anywhere — an error escaping Fastify's request lifecycle or BullMQ's job wrapper crashed the process with only whatever pino happened to flush, no structured log, no alert.
17. `CORS_ORIGIN=*` was the shipped default, passed directly to `@fastify/cors` with no production-time check and no support for a real multi-origin allowlist (a comma-separated value would have been treated as one invalid literal origin).
18. Public `/uploads` accepted any file extension/content-type — a client could upload `x.svg`/`x.html` and have it served back from the API's own origin with an attacker-chosen extension (stored-XSS-via-upload).
19. `mobile/search/results.tsx` — the single most important screen in the app — silently treated a genuine network/server failure identically to a real "no rides found" empty state (`isError` was never read from the query hook), directly contradicting this codebase's own stated UX principle that every error state must be a designed surface.
20. No crash-reporting SDK existed anywhere (API or mobile) — an unhandled exception was only ever a log line, with no aggregation, alerting, or stack-trace grouping.
21. No `/metrics` endpoint / APM integration, and no alerting mechanism of any kind (nothing pages a human when `/health` goes red).
22. RESEND_API_KEY / REDIS_URL being simply forgotten in production degraded email/queueing silently, with no boot-time warning.

### P2/P3 — Noted, not all fixed (see §7)

Google OAuth redirect-scheme not allowlisted (custom-scheme hijack risk, low severity); admin JWT stored in `localStorage`; no app icon/splash configured (ships Expo's default branding); no `NetInfo`/retry policy on RTK Query; two divergent pino logger configs; no dead-letter/failed-job inspection UI for BullMQ.

---

## 4. Changes/fixes made

All changes are on this session's branch. Full diff is in git history; summary by area:

**Critical production-build fix**
- `apps/api/package.json`: `start`/`worker:start` now run `tsx src/server.ts` / `tsx src/worker.ts` (matching `dev`/`worker`'s existing pattern) instead of `node dist/*.js`. `tsx` moved from `devDependencies` to `dependencies` since it's now needed at runtime. **Verified by actually booting the process** (see §5) — this is not a theoretical fix.
- Added `docker/api.Dockerfile` and `docker/worker.Dockerfile` (Turborepo's documented `turbo prune` pattern) — the first deployable container images this repo has ever had. **Verified by manually replaying every layer** (prune → install → copy source → boot) outside Docker (no Docker daemon available in this sandbox — see §6) and confirming the server boots and serves real HTTP responses from that exact directory structure.
- Added `.dockerignore`.

**Security**
- `apps/api/src/config/env.ts`: added `assertProductionSafe()` — refuses to boot in `NODE_ENV=production` with the insecure `JWT_SECRET` default, `CORS_ORIGIN='*'`, or without a real SMS/storage provider configured (see below); logs a loud warning if `RESEND_API_KEY`/`REDIS_URL`/`SENTRY_DSN` are unset.
- Real SMS provider: `apps/api/src/lib/sms/twilio-sms-provider.ts` (direct HTTP call to Twilio's REST API, matching the codebase's existing Resend/Expo-push pattern), activated when `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER` are all set; falls back to the existing dev logger otherwise. Required in production (boot refuses without it).
- Real file storage: `apps/api/src/lib/storage/s3-storage-adapter.ts` (`@aws-sdk/client-s3`, works with AWS S3 or any S3-compatible provider via `S3_ENDPOINT`), activated when `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` are all set; falls back to local disk otherwise. Required in production.
- `apps/api/src/app.ts`: added `authenticateSuperAdmin`, applied to account-suspension/restriction routes and `PATCH /operational-config` (platform-wide pricing/matching/cancellation thresholds) — previously any `admin` role could reach these.
- `apps/api/src/modules/auth/auth.routes.ts`: OTP request/verify now rate-limited by phone number (not spoofable IP); verify got a dedicated limit where none existed before.
- `apps/api/src/modules/admin/admin-auth.routes.ts`: admin login rate-limited by email, not IP.
- `apps/api/src/app.ts`: `CORS_ORIGIN` now supports a real comma-separated allowlist.
- `apps/api/src/modules/uploads/uploads.routes.ts`: both upload endpoints now enforce an explicit MIME-type + extension allowlist (JPEG/PNG/WEBP/HEIC/PDF only).

**Reliability/operability**
- `apps/api/src/worker.ts`: added graceful SIGTERM/SIGINT shutdown (drains in-flight jobs before closing Redis/DB), mirroring `server.ts`.
- `apps/api/src/server.ts` + `worker.ts`: added `uncaughtException`/`unhandledRejection` handlers with structured logging and (when configured) Sentry reporting.
- `apps/api/src/config/monitoring.ts` (new): real Sentry (`@sentry/node`) initialization, gated by `SENTRY_DSN`; safe no-op when unset. Wired into the global error handler (only genuinely unhandled 500s, not expected `AppError`s), both process-level handlers, and the worker's exhausted-retry path.
- `apps/api/src/app.ts`: `/uploads` static-mount directory is now created at boot (was warning on every fresh checkout).

**Migration fix**
- Deleted the orphaned `0019_silent_crystal.sql` (never journaled, never applied); added `0027_add_rating_received_notification_event.sql` + matching snapshot + journal entry to actually add the missing `rating_received` enum value.

**Correctness**
- `packages/config/src/index.ts`: `DEFAULT_LOCALE` corrected from `'en'` to `'fr'`, matching its own test and the product's Tunisia-market design.

**Mobile**
- `apps/mobile/app/search/results.tsx`: now reads `isError`/`refetch` from the search query and renders a distinct, real error surface (title/description/retry) instead of silently falling into the "no rides found" empty state. New i18n strings added (en/fr/ar).
- `apps/mobile/app.config.js`: the iOS ATS exception is now conditional on `API_BASE_URL` actually being `http://` at build time — a production build pointed at a real `https://` domain no longer ships it at all.

**Infrastructure/CI**
- `.github/workflows/ci.yml` (new): runs `pnpm install` → `db:migrate` → generates `api-client` against a real booted server → `lint` → `typecheck` → `format:check` → `build` → `test`, against real Postgres (PostGIS image, matching `docker-compose.yml`) and Redis service containers on every push/PR.

---

## 5. Tests and validation performed

Everything below was actually executed in this session, not assumed:

- **`pnpm typecheck`** — all 9 packages clean, both before and after every fix (re-run after each change batch).
- **`pnpm lint`** — 0 errors across all packages, both before and after; only pre-existing warnings remain (confirmed identical set, none newly introduced).
- **`pnpm --filter @vaya/api build`** (`tsc`) — clean compile.
- **`pnpm test` (API)** — 185 unit tests pass; 37 integration-test failures, **all confirmed to be `ECONNREFUSED`/Redis-connection failures** (no Docker daemon available in this sandbox — see §6), not logic regressions. Diffed the failure list before and after every fix; identical failure set throughout.
- **`pnpm test` (mobile)** — 260/269 passing; the 9 failures are pre-existing locale/ICU date-format drift and a pre-existing `'delay'`-undefined error, **independently confirmed by stashing this session's own `results.tsx` change and re-running against the untouched file — identical 4 failures either way.**
- **`pnpm test` (design-system)** — 124/125; the 1 failure is the pre-existing, date-dependent `date-time-sheets` snapshot (documented as pre-existing in this repo's own history).
- **`pnpm test` (admin/domain/validation/api-client)** — all green (11 + 213 + 6 + passing respectively).
- **Live server boot test**: actually ran `pnpm --filter @vaya/api start` (the exact fixed production command) against a real HTTP client, confirming `/api/v1/health` and `/api/v1/openapi.json` both respond correctly, the graceful-shutdown/Sentry-no-op paths don't throw, and the process binds correctly.
- **Live Dockerfile-pattern replay**: manually executed every layer of `docker/api.Dockerfile` outside Docker (`turbo prune` → fresh-directory `pnpm install --frozen-lockfile` → copy pruned source → `pnpm start`) and confirmed the server boots and serves real HTTP responses from that exact directory structure — the strongest verification available without a Docker daemon.
- **`packages/config` test** — confirmed red before the `DEFAULT_LOCALE` fix, green after.
- **CI workflow YAML** — validated for syntactic correctness (`python3 -c "import yaml; yaml.safe_load(...)"`); the workflow itself has not run in real GitHub Actions (no way to do so from this sandbox).

No regression was introduced by any fix in this session — every test-suite diff was checked failure-by-failure against the pre-fix baseline.

---

## 6. UNVERIFIED items (could not be proven from the repo / this sandbox)

This sandboxed environment has **no Docker daemon, no real Postgres/Redis instance, no real Twilio/AWS/Google/Sentry credentials, no EAS/App Store/Play Store access, and no physical device.** The following are honestly unverified, not assumed:

- The 37 integration-test failures' *underlying logic* (only their inability to reach a real DB/Redis was verified) — i.e., these tests were not actually proven to pass against live infrastructure in this session, only shown to fail solely on connection refusal.
- `docker/api.Dockerfile`/`worker.Dockerfile` have not been built or run through actual `docker build`/`docker run` — verified via manual layer-replay outside Docker instead (see §5), which validates the runtime logic but not Docker-specific behavior (image size, layer caching, `USER node` permissions on bind-mounted volumes, etc.).
- `.github/workflows/ci.yml` has not executed in real GitHub Actions.
- Real Twilio/S3/Sentry/Resend behavior — the integration code follows each provider's documented HTTP API exactly, but none of it has been exercised against a real account/credential.
- EAS production build environment variables (`API_BASE_URL` etc.) — these live only in the EAS dashboard, invisible to a repo audit. Whether a real production mobile build actually points at a real backend cannot be confirmed here.
- Any on-device iOS/Android behavior (maps rendering, push delivery, camera capture, deep links) — no physical device or simulator available.
- Whether a real production Postgres will actually accept `0027`'s `ALTER TYPE ... ADD VALUE` cleanly on top of whatever migration state a real deployed database is already at (verified only against the migration *files themselves*, not a live apply).
- Load/stress behavior of any endpoint under real concurrent traffic.
- Whether `@aws-sdk/client-s3`'s `PutObjectCommand`/`GetObjectCommand` usage in `s3-storage-adapter.ts` works against a real bucket (permissions, region config, etc.) — only unit/typecheck-level correctness was verified.

---

## 7. Remaining P0/P1/P2/P3 risks (updated after pass 2 — see §11 for what changed)

**P0 — must resolve before real users, all require a human with real credentials (full detail: `LAUNCH_ACTIONS.md`):**
- No Terms of Service / Privacy Policy document or URL exists (needed for store submission and legal compliance) — needs a human/legal author.
- No account-deletion/data-export mechanism (GDPR right to erasure/portability) — needs deliberate data-retention design, not a rushed implementation.
- No backup/restore strategy, documented or automated, for the production database.
- Real infrastructure has never been provisioned or exercised: no live Postgres/Redis/S3/Twilio/Sentry account exists yet; every fix in this file is code-level readiness (now including a `preflight` script that checks real reachability/credentials once these exist — see §11), not proof the actual services work end-to-end.
- No physical-device verification of anything (maps, push, camera, deep links) has ever been performed for this app.
- EAS production build's `API_BASE_URL` and equivalent env vars are unverifiable from the repo — must be confirmed real (not `localhost`) before any production mobile build ships.

**P1 — resolved in pass 2 (§11), no longer open:** ~~No crash-reporting SDK on mobile~~ · ~~No `/metrics`/APM~~ · ~~No app icon/splash screen~~ · ~~Google OAuth redirect custom-scheme not allowlisted~~ · ~~No dead-letter/failed-job inspection surface for BullMQ~~.

**P1 — still open (needs a human, not more code — see `LAUNCH_ACTIONS.md`):**
- No alerting mechanism configured (Sentry alert rules + an uptime check both need a real account — the code-side hooks they'd attach to, `/health` and Sentry SDK init, both now exist).
- Admin JWT still stored in `localStorage`, mitigated but not eliminated in pass 2 (shorter TTL + a real CSP — see §11) — a full httpOnly-cookie migration was deliberately not attempted blind (same reasoning as mobile Sentry in pass 1: it touches live auth wiring this sandbox cannot verify end-to-end without a real database, and getting it wrong risks a worse outcome — locked-out admin access or a CSRF hole — than the current, working-but-imperfect mechanism).

**P2/P3 — resolved in pass 2:** ~~No `NetInfo`/retry policy on mobile RTK Query~~ · ~~two divergent pino logger configs~~ · ~~`localhost` API fallback duplicated across 3 mobile files~~.

**P2/P3 — still open:** No CDN/DNS/domain has ever been provisioned for this product (no production domain exists at all, as expected pre-launch — `LAUNCH_ACTIONS.md` #11); container registry/hosting/orchestrator not yet chosen (`LAUNCH_ACTIONS.md` #18); Google OAuth/Maps/Resend production credentials not yet provisioned (optional features, app works without them — `LAUNCH_ACTIONS.md` #19-21).

---

## 8. Exact final pre-launch checklist

**Full detail (exact action / why / exact credential / where / how to verify) for every item below is in `LAUNCH_ACTIONS.md`** — this is the short form.

1. [ ] Provision real production Postgres (PostGIS-enabled) and Redis instances; set `DATABASE_URL`/`REDIS_URL` (use `rediss://` for a managed Redis requiring TLS).
2. [ ] Generate a real `JWT_SECRET` (32+ chars, e.g. `openssl rand -base64 48`) — the app refuses to boot in production without one.
3. [ ] Provision Twilio (`TWILIO_ACCOUNT_SID`/`AUTH_TOKEN`/`FROM_NUMBER`) — required, app refuses to boot without it.
4. [ ] Provision S3 or an S3-compatible bucket (`S3_BUCKET`/`REGION`/`ACCESS_KEY_ID`/`SECRET_ACCESS_KEY`) — required, app refuses to boot without it.
5. [ ] Set `CORS_ORIGIN` to the real admin-app domain (comma-separated if more than one, now genuinely supported — see §11) — required, not `*`.
6. [ ] Set `SENTRY_DSN` for both the API and mobile (both fully wired in code — see §11 — currently a safe no-op with no DSN set).
7. [ ] **Run `pnpm --filter @vaya/api preflight`** against the real target environment's env vars before every deploy — new in pass 2 (§11), checks DB/Redis/Twilio/S3 reachability and Sentry DSN shape for real, in one pass.
8. [ ] Run `pnpm --filter @vaya/api db:migrate` against the production database **before** deploying the new application revision (never from inside the runtime container — see `docker/api.Dockerfile`'s comment; `verify-migrations`, new in §11, now runs automatically in CI to catch an unjournaled migration before it ships).
9. [ ] Choose a container registry + hosting/orchestrator; both Dockerfiles now build automatically on every CI run (§11) — deploy them there. `docker/docker-compose.prod.yml` (new in §11) is available for a local prod-like dry run first.
10. [ ] Set up automated Postgres backups with a tested restore procedure (currently entirely absent).
11. [ ] Draft and publish a real Terms of Service and Privacy Policy; link them from the sign-in screen's existing disclaimer text; add the Privacy Policy URL to both store listings.
12. [ ] Design and implement account deletion / data export before launch, or explicitly accept the compliance risk of launching without it.
13. [ ] Confirm EAS production build's `API_BASE_URL` (and Google Maps/Firebase/Sentry keys) are real, not `localhost`/blank, in the EAS dashboard.
14. [ ] Real device QA pass (iOS + Android): maps rendering, push notification delivery, camera KYC capture, deep links, the new app icon/splash (§11).
15. [ ] Provision a real production domain + HTTPS certificate for the API; once live, the mobile app's ATS exception disappears automatically (already wired conditionally) — confirm this in a real build.
16. [ ] Set up minimum alerting (Sentry alert rules + an uptime check on `/health`) so a real outage pages a human.
17. [ ] Set up GitHub branch protection on `main` requiring CI to pass (the workflow exists and now includes a real Docker build — see §11 — but nothing blocks a merge on it without this repo setting).
18. [ ] **Run the smoke test against the newly-deployed environment**: `API_BASE_URL=<real-url> pnpm --filter @vaya/e2e smoke` — new in pass 2 (§11), the actual "is this deploy really done" signal.

---

## 9. Rollback/recovery requirements

**Full operational detail now lives in `RUNBOOK.md`** (new in pass 2 — health-check order, common-incident response, deploy sequence, rollback procedure, and an honest list of what the runbook itself still can't cover without real infrastructure). Summary:

- **Database**: automated point-in-time-recoverable backups (managed Postgres provider's native PITR, or `pg_basebackup` + WAL archiving) with a **tested** restore — "we have backups" unverified by a real restore is not a backup strategy. Still entirely absent — `LAUNCH_ACTIONS.md` #8.
- **Migrations**: pass 1's fix to `0027` demonstrated the failure mode of an unjournaled migration; `verify-migrations` (new in §11) now catches this class of bug automatically in CI, and `db:migrate` runs as a gated CI step, never manually, per `RUNBOOK.md` §4.
- **Application rollback**: deploys now produce real container images (`docker/api.Dockerfile`/`worker.Dockerfile`, both building automatically in CI as of §11) — rollback is "redeploy the previous image tag," detailed in `RUNBOOK.md` §5. Still requires whatever orchestrator is chosen (not yet selected — `LAUNCH_ACTIONS.md` #18) to keep previous tags addressable.
- **Incident response**: `RUNBOOK.md` now exists with concrete, tool-backed diagnostic steps (§2's health-check order, §3's per-incident playbook). What it still can't provide: an actual on-call rotation/escalation path (needs real organizational information this repo doesn't have) and real alerting to page whoever's on that rotation (`LAUNCH_ACTIONS.md` #12).

---

## 11. Second-pass hardening (2026-09-10, continued — everything completable without real credentials)

Scope: implement every remaining P1/P2 finding from §7 that is genuinely completable inside the repo — no external accounts, no credentials, no legal decisions, no physical device. Full diff is in git history; summary by area:

**Migration safety** — `apps/api/scripts/verify-migrations.ts` (new): checks every `.sql` migration file has exactly one journal entry (the exact class of bug pass 1 found and fixed — `0019_silent_crystal.sql` existed on disk but was never journaled, so it silently never applied). Verified to actually catch that failure mode: temporarily reintroduced an orphaned file and confirmed the script fails loudly; removed it and confirmed a clean pass. A separate, genuinely new finding surfaced along the way — migration `0014`'s snapshot was missing from the drizzle-kit chain — investigated and confirmed to be a correct, deliberate state (those columns are raw PostGIS SQL never declared in the Drizzle TS schema, so drizzle-kit was never going to track them regardless), downgraded to a non-blocking warning rather than a false-positive failure. Wired into `.github/workflows/ci.yml` as a required step before `db:migrate`.

**CI/CD hardening** — `.github/workflows/ci.yml`: added a `docker-build` job that actually builds both `docker/api.Dockerfile` and `docker/worker.Dockerfile` on every push/PR (GitHub-hosted runners have a real Docker daemon, unlike this sandbox — this is the first time either image has been built end-to-end via `docker build`, not just layer-replayed outside Docker as pass 1 did). Added a non-blocking `pnpm audit` dependency-vulnerability step and a job timeout. Added `.github/dependabot.yml` (weekly npm/GitHub Actions/Docker updates, grouped by minor/patch to avoid PR noise).

**Security** — `apps/api/src/modules/auth/google-auth.routes.ts`: `sanitizeAppRedirectUri` tightened from "reject only http(s)" to an explicit allowlist (`vaya://`, `exp://`, `exp+vaya://` — the only schemes the mobile client's own `Linking.createURL` can ever actually produce), closing a real custom-scheme-collision hijack risk on the one-time OAuth ticket handoff. Covered by 7 new pure unit tests. Admin session hardening (`apps/api/src/modules/admin/admin-auth.routes.ts`, `apps/admin/index.html`): token TTL shortened 12h→4h, and a real `Content-Security-Policy`/`base-uri` meta tag added to the admin SPA — both real, verified, safe-to-ship mitigations for the admin-JWT-in-`localStorage` risk; a full httpOnly-cookie migration was deliberately not attempted (see §7 — same "don't touch live auth wiring blind" reasoning pass 1 applied to mobile Sentry).

**Reliability/operability** — `apps/api/src/app.ts`/`config/logger.ts`: the two previously-divergent pino logger configs (Fastify's own inline config vs. `getLogger()`) are now one shared instance via Fastify v5's `loggerInstance` option, with real redaction rules added (`Authorization`/`cookie` headers, `password`/`accessToken`/`refreshToken` fields) — covers request logging too, not just explicit log calls. `apps/api/src/lib/metrics.ts` + `modules/metrics/metrics.routes.ts` (new, `prom-client`): a real `GET /metrics` Prometheus endpoint (default Node process metrics + `http_requests_total`/`http_request_duration_seconds` labeled by parameterized route/method/status, verified live against a real booted server, not just unit-tested). `apps/api/src/modules/admin/admin-queue.service.ts` (new) + a `GET/POST /admin/queue/failed[/retry]` route pair + a new admin-app "Background Jobs" page: BullMQ's failed-job data (previously Redis-CLI-only) is now visible and retryable from the admin panel. `docker/api.Dockerfile`/`worker.Dockerfile` gained real `HEALTHCHECK` instructions (the API's hits `/health` directly; the worker, which has no HTTP server, writes a heartbeat file every 15s that the healthcheck verifies is fresh — both tested for real: fresh vs. stale-file cases). `docker/docker-compose.prod.yml` (new): wires the real api/worker images together with Postgres/Redis for a local prod-like dry run. `apps/api/scripts/preflight.ts` (new): a pre-deploy CLI that actually attempts to reach the target environment's DATABASE_URL/REDIS_URL, makes a real authenticated Twilio API call and a real S3 `HeadBucket` call, and validates the Sentry DSN's shape — the network-reachability checks `assertProductionSafe` (boot-time, pass 1) structurally can't do. `tests/e2e/tests/smoke.api.test.ts` (new): a read-only, side-effect-free Playwright suite explicitly safe to run against a real production environment post-deploy (unlike every other suite under `tests/e2e`, which create real users/bookings) — verified against a real booted local server (5/6 checks pass; the 6th, DB-health, correctly fails in this sandbox with no live Postgres, proving the check actually works).

**Mobile** — `apps/mobile/src/services/monitoring/sentry.ts` (new) + `ErrorBoundary.tsx` wiring: real `@sentry/react-native` integration, gated by `SENTRY_DSN` (unset = safe no-op, mirroring the API's established pattern), using the officially-documented Expo config plugin (`@sentry/react-native/expo`) with `disableAutoUpload: true` so no build-time network call to Sentry's API is attempted without real org credentials. `src/state/api.ts`: RTK Query's `retry` utility wraps the base query (exponential backoff, max 2 retries, bails immediately on any 4xx via `retry.fail` so a definitive client error isn't retried pointlessly) plus a 15s request timeout (previously none — a hung connection left a query in `isLoading` forever). `src/hooks/useIsOffline.ts` + `src/components/OfflineBanner.tsx` (new, `@react-native-community/netinfo`): a persistent, honest "you're offline" surface mounted once at the app root — previously zero connectivity awareness existed anywhere in the app. `apps/mobile/assets/{icon,adaptive-icon-foreground,favicon,splash-icon}.png` (new) + `app.config.js` wiring (`icon`, `android.adaptiveIcon`, `web.favicon`, the `expo-splash-screen` plugin) + `app/_layout.tsx` (`SplashScreen.preventAutoHideAsync`/`hideAsync` paired with the existing font-load gate): a real, on-brand icon/splash — a geometric "V" monogram in the app's own already-documented brand tokens (navy `#2E3B42` + sage `#7FA491`, `packages/design-system/src/tokens/colors.ts`), not a fabricated brand identity, replacing Expo's generic default. Explicitly flagged in `LAUNCH_ACTIONS.md` for a real designer's review before a store listing goes live — this was generated programmatically, not designed. Config-drift cleanup: the `apiBaseUrl ?? 'http://localhost:3000/api/v1'` fallback, previously duplicated verbatim across 3 files, is now one shared `src/config/env.ts`.

**Correctness** — `packages/config/src/index.ts`'s `DEFAULT_LOCALE` fix (from pass 1) and all of the above were re-verified together in the same full-suite re-run described in §5's update below; nothing new was found broken.

**Tests added this pass** (16 total, all passing): `google-auth-redirect.test.ts` (7, pure-function OAuth-scheme-allowlist coverage), `admin-queue.service.test.ts` (7, mocked-queue coverage of the new failed-jobs service), `metrics.test.ts` (2, confirms both custom series + default Node metrics appear in real Prometheus output), `OfflineBanner.test.tsx` (3, online/offline/restored transitions via a new `netinfo` test mock), `sentry.test.ts` (4, mocked-SDK coverage of the DSN-gated no-op/init/capture behavior).

**Validation performed this pass**: `pnpm typecheck`/`lint`/`build` re-run clean across the full monorepo after every change batch (including a new `apps/api/scripts/tsconfig.json` — the two new CLI scripts were silently excluded from `apps/api`'s typecheck before this, now genuinely checked). Full test suite re-run and diffed against the pass-1 baseline: API 201/238 non-skipped passing (up from 185 — all 16 new tests pass; the same 37 pre-existing `ECONNREFUSED`-only failures remain, confirmed by full log inspection, no new failure category introduced); mobile 267/276 (up from 260 — same 9 pre-existing locale/ICU-drift failures, confirmed identical); design-system 124/125 (same single pre-existing date-dependent snapshot); admin 11/11, domain 213/213, validation 6/6 all still green. Zero regressions introduced by this pass.

---

## 12. Final verdict: **CONDITIONAL GO**

The application code is now genuinely closer to launch-ready than when this audit started: the production build actually runs (it didn't), auth can't be trivially forged, OTP and file storage have real, activatable providers instead of silent no-ops, a live data-corrupting migration bug and a live wrong-default-language bug are both fixed, a CI pipeline exists to catch the next such regression before it reaches `main` (and now actually builds the production Docker images on every push), and — as of pass 2 — every further engineering-completable gap (crash reporting, metrics, offline handling, job visibility, a real app icon, a pre-deploy verification script, a safe-to-run-against-production smoke test) is closed too.

It is **not GO** because the remaining launch-blocking items are not code problems this audit can fix: no real infrastructure has ever been provisioned (Postgres/Redis/S3/Twilio/Sentry all need real accounts and credentials — `pnpm --filter @vaya/api preflight`, new in pass 2, will verify each one the moment real credentials exist), no Terms of Service or Privacy Policy exists (store submission is impossible without one), no account-deletion mechanism exists (a real compliance gap), and nothing in this app has ever been verified on a real device. None of these can be fabricated by an audit — they need a human with real authority over credentials, legal content, and app-store accounts.

**Conditional on:** completing `LAUNCH_ACTIONS.md` in full — every item there is infrastructure provisioning, a credential, or a legal/product decision, not further engineering. This codebase itself is ready for a genuine first production deploy the moment that list is done. Do not launch to real users before the P0 section of `LAUNCH_ACTIONS.md` (items 1-8) is complete, and treat the P1 section (items 9-17) as required before considering the launch actually finished, not merely started.
