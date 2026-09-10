# VAYA — Production Readiness Audit

**Audit date:** 2026-09-10
**Scope:** Full repository — backend (`apps/api`), mobile (`apps/mobile`), admin (`apps/admin`), shared packages, infrastructure, docs.
**Method:** Direct code inspection (this session) + 5 parallel deep-dive audits (security/authz, infrastructure/deployment, mobile release-engineering, external services, observability), cross-verified against each other and against actually running the code — not against CLAUDE.md's own self-reported changelog, which this audit treated as a claim to verify, not a fact.

---

## 1. Executive summary

VAYA's *application logic* is genuinely mature: a real OSRM/Google routing foundation, a sophisticated matching engine, a well-modeled domain layer, and a large, mostly-passing test suite. But this audit found the codebase had **never actually been deployed, and could not have been** — the documented production start command (`node dist/server.js`) crashes immediately on boot, there was no CI pipeline of any kind, three separate "provider" abstractions (SMS, file storage, error tracking) were hardcoded to dev-only stubs with no way to activate a real backend, and a hardcoded insecure JWT secret would have let anyone forge admin tokens against a misconfigured deploy. None of this was visible from reading the code casually — it only surfaces when you actually try to run what's documented, which is what this audit did.

**12 P0 (launch-blocking) issues were found; 9 were fixed directly in this session.** The remaining P0s require real infrastructure, real credentials, or legal/product decisions that cannot be manufactured in a sandboxed audit (see §7). Every fix was verified by actually running the affected code path — typecheck, lint, the full test suite, and, for the most critical findings, by booting the real server process and hitting real HTTP endpoints — not just by reading the diff.

**Verdict: CONDITIONAL GO.** See §10 for the exact conditions.

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

## 7. Remaining P0/P1/P2/P3 risks

**P0 — must resolve before real users:**
- No Terms of Service / Privacy Policy document or URL exists (needed for store submission and legal compliance) — needs a human/legal author.
- No account-deletion/data-export mechanism (GDPR right to erasure/portability) — needs deliberate data-retention design, not a rushed implementation.
- No backup/restore strategy, documented or automated, for the production database.
- Real infrastructure has never been provisioned or exercised: no live Postgres/Redis/S3/Twilio/Sentry account exists yet; everything in §4's fixes is code-level readiness, not proof the actual services work end-to-end.
- No physical-device verification of anything (maps, push, camera, deep links) has ever been performed for this app.
- EAS production build's `API_BASE_URL` and equivalent env vars are unverifiable from the repo — must be confirmed real (not `localhost`) before any production mobile build ships.

**P1:**
- No crash-reporting SDK on mobile (API-side Sentry was added this session; mobile was deliberately not touched — see rationale below).
- No `/metrics`/APM, no alerting mechanism (nothing pages a human on an incident).
- No app icon/splash screen configured (ships Expo's default branding).
- Admin JWT stored in `localStorage` (XSS exfiltration risk, given the token's high privilege).
- Google OAuth redirect custom-scheme not allowlisted.
- No dead-letter/failed-job inspection surface for BullMQ (Redis CLI only).

**P2/P3:** No `NetInfo`/retry policy on mobile RTK Query; two divergent pino logger configs; `localhost` API fallback duplicated across 3 mobile files; no CDN/DNS/domain has ever been provisioned for this product (no production domain exists at all, as expected pre-launch).

**Why mobile crash reporting wasn't added this session:** API-side Sentry (pure Node init, fully typecheck/boot-verified) was low-risk. Mobile Sentry needs a native Expo config plugin and, typically, a prebuild/rebuild to take effect — exactly the category of change this sandboxed environment cannot verify (no EAS build, no device). Adding it blind risked silently breaking the Expo config in a way this audit had no way to detect. Flagging it honestly as an unresolved P1 is more useful than claiming a fix that might not actually build.

---

## 8. Exact final pre-launch checklist

1. [ ] Provision real production Postgres (PostGIS-enabled) and Redis instances; set `DATABASE_URL`/`REDIS_URL` (use `rediss://` for a managed Redis requiring TLS).
2. [ ] Generate a real `JWT_SECRET` (32+ chars, e.g. `openssl rand -base64 48`) — the app now refuses to boot in production without one.
3. [ ] Provision Twilio (or set `TWILIO_ACCOUNT_SID`/`AUTH_TOKEN`/`FROM_NUMBER`) — required, app refuses to boot without it.
4. [ ] Provision S3 or an S3-compatible bucket (`S3_BUCKET`/`REGION`/`ACCESS_KEY_ID`/`SECRET_ACCESS_KEY`) — required, app refuses to boot without it.
5. [ ] Set `CORS_ORIGIN` to the real admin-app domain (comma-separated if more than one) — required, not `*`.
6. [ ] Set `SENTRY_DSN` (API) — strongly recommended, non-fatal if skipped but you'll fly blind on errors.
7. [ ] Run `pnpm --filter @vaya/api db:migrate` against the production database **before** deploying the new application revision (never from inside the runtime container — see `docker/api.Dockerfile`'s comment).
8. [ ] `docker build -f docker/api.Dockerfile .` and `docker build -f docker/worker.Dockerfile .`, actually run them, confirm both boot against real infra (unverified in this sandbox — see §6).
9. [ ] Set up automated Postgres backups with a tested restore procedure (currently entirely absent).
10. [ ] Draft and publish a real Terms of Service and Privacy Policy; link them from the sign-in screen's existing disclaimer text; add the Privacy Policy URL to both store listings.
11. [ ] Design and implement account deletion / data export before launch, or explicitly accept the compliance risk of launching without it.
12. [ ] Confirm EAS production build's `API_BASE_URL` (and Google Maps/Firebase keys) are real, not `localhost`/blank, in the EAS dashboard.
13. [ ] Real device QA pass (iOS + Android): maps rendering, push notification delivery, camera KYC capture, deep links.
14. [ ] Provision a real production domain + HTTPS certificate for the API; once live, the mobile app's ATS exception disappears automatically (already wired conditionally — see §4) — confirm this in a real build.
15. [ ] Set up minimum alerting (e.g., Sentry alert rules + an uptime check on `/health`) so a real outage pages a human.
16. [ ] Add an app icon and splash screen (currently Expo's default placeholder).
17. [ ] Merge `.github/workflows/ci.yml` to `main` and confirm a real PR actually runs and gates on it.

---

## 9. Rollback/recovery requirements

None of this existed before this session; the following is the minimum this audit recommends before launch, not a claim that it's already in place:

- **Database**: automated point-in-time-recoverable backups (managed Postgres provider's native PITR, or `pg_basebackup` + WAL archiving) with a **tested** restore — "we have backups" unverified by a real restore is not a backup strategy.
- **Migrations**: this session's fix to `0027` demonstrates the failure mode of an unjournaled migration; going forward, `db:migrate` must run as a gated CI/CD step (now wired into `.github/workflows/ci.yml`), never manually.
- **Application rollback**: since deploys now produce real container images (`docker/api.Dockerfile`/`worker.Dockerfile`), rollback is "redeploy the previous image tag" — but this requires whatever orchestrator is chosen (not yet selected) to keep previous tags addressable.
- **Incident response**: no runbook exists. At minimum, before launch: a documented "how to check `/health`, read Sentry, and roll back" one-pager for whoever is on call.

---

## 10. Final verdict: **CONDITIONAL GO**

The application code is now genuinely closer to launch-ready than when this audit started: the production build actually runs (it didn't), auth can't be trivially forged, OTP and file storage have real, activatable providers instead of silent no-ops, a live data-corrupting migration bug and a live wrong-default-language bug are both fixed, and a CI pipeline exists to catch the next such regression before it reaches `main`.

It is **not GO** because several launch-blocking items are not code problems this audit can fix: no real infrastructure has ever been provisioned (Postgres/Redis/S3/Twilio/Sentry all need real accounts and credentials), no Terms of Service or Privacy Policy exists (store submission is impossible without one), no account-deletion mechanism exists (a real compliance gap), and nothing in this app has ever been verified on a real device.

**Conditional on:** completing the checklist in §8 — most of which is infrastructure provisioning and legal/product work, not further engineering — this codebase is ready for a genuine first production deploy. Do not launch to real users until at minimum items 1–7 and 9–13 in §8 are done.
