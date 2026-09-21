# VAYA Security Audit — 2026-09-21

Scope: whole repository (`apps/api`, `apps/mobile`, `apps/admin`, `apps/website`, `packages/*`, `docker/`, `.github/`, `tests/`), including git history. Method: manual code review of every route module and its service layer, dependency audit (`pnpm audit`), secrets scan (working tree + full git history), infrastructure review, and empirical probing where a claim could be tested without infrastructure. Frameworks used as a checklist: OWASP Top 10, OWASP API Top 10, OWASP ASVS (V2/V3/V4/V8/V13), OWASP MASVS-STORAGE/AUTH/NETWORK, CWE, STRIDE (see `security-threat-model.md`).

**Nothing in this report is a claim that VAYA is "secure".** Where something could not be verified it is marked **UNVERIFIED**.

## 1. Executive summary

VAYA's core authorization model is sound: every booking/trip/conversation/notification/ride service function re-derives the caller's relationship to the resource from the database (rider/driver/party checks) and returns 403/404 on mismatch; SQL is parameterized everywhere (no injection sink found); admin endpoints are split by token type and role; refresh tokens are hashed; mobile tokens are in `SecureStore`; no credentials are committed (tree or history). The audit found **no IDOR/BOLA** in the authenticated API surface.

The serious problems were elsewhere — in the controls *around* authentication:

1. **A one-line deployment mistake gave every visitor a valid login code for any phone number.** The OTP was echoed in the HTTP response whenever `NODE_ENV=development`, `NODE_ENV` defaults to `development`, and the documented production procedure (`cp apps/api/.env.example docker/.env.prod`) copies `NODE_ENV=development` over the image's `ENV NODE_ENV=production` (compose `env_file` wins over image `ENV`). In that state every production safety check is also skipped.
2. **The OTP brute-force and rate-limit defences did not work as documented.** The "per-phone" limits keyed on `request.body`, which is not parsed yet when `@fastify/rate-limit` runs, so they were silently per-IP — and the IP was attacker-controlled because `trustProxy: true` believed any `X-Forwarded-For`. Codes were stored in plaintext, several could be valid at once, guesses were unlimited within the TTL, and single-use consumption was not atomic.
3. **Google sign-in could take over an existing account** by presenting an unverified email, and would overwrite an existing account's bound Google identity.
4. Several **business-logic** gaps (premature trip completion → reputation farming; duplicate-booking race; seat count above vehicle capacity) and **cost-abuse** surfaces (unauthenticated Google-proxy and routing endpoints with no meaningful limit).

All Critical/High findings and 14 of 20 Medium/Low findings are fixed in this branch (see §3); six findings remain, all requiring a product decision or infrastructure (§4).

### Security score (counts, not a percentage)

| Severity | Found | Fixed | Remaining |
|---|---|---|---|
| Critical | 1 | 1 | 0 |
| High | 4 | 4 (one with a non-reachable residual, see SEC-014) | 0 |
| Medium | 11 | 8 | 3 |
| Low | 9 | 6 | 3 |
| Informational | 5 | — | — |
| **Total** | **25** | **19** | **6** |

"Fixed" = code/config change in this branch **plus** a regression test. Several fixes are covered only by tests that need Postgres/Redis and **were not executed** in the audit environment (no Docker daemon, no database credentials) — each such case is flagged **DB-UNVERIFIED** below.

## 2. Critical and High findings

### VAYA-SEC-001 — Critical — OTP returned in HTTP response; fail-open `NODE_ENV`
- **Component / location:** `apps/api/src/modules/auth/auth.routes.ts` (`devCode`), `apps/api/src/modules/users/users.routes.ts`, `apps/api/src/config/env.ts` (`NODE_ENV` default `development`), `docker/docker-compose.oracle.yml` + `RUNBOOK.md` (deploy procedure). CWE-489/CWE-1188/CWE-306; OWASP A05, API2.
- **Vulnerability:** `devCode = NODE_ENV === 'development' ? code : undefined`. `NODE_ENV` defaults to `development` and `.env.example` sets it. Compose `env_file: .env.prod` overrides the image's `ENV NODE_ENV=production`.
- **Attack:** `POST /auth/otp/request {phone: victim}` → response contains the code → `POST /auth/otp/verify` → full session as the victim. Requires only that the operator followed the documented deploy steps. In the same state `assertProductionSafe` is skipped (insecure JWT default, CORS `*`, dev SMS/storage adapters).
- **Impact:** Unauthenticated account takeover of any phone-registered user, including drivers with KYC data.
- **Root cause:** Security behavior derived from an ambient, defaultable variable rather than an explicit opt-in.
- **Evidence:** Code above; compose `env_file` precedence; `RUNBOOK`/compose comments instructing the `cp`.
- **Fix (done):** `devCode` now requires `EXPOSE_DEV_OTP=true` **and** `NODE_ENV=development` **and** no Twilio credentials (`shouldExposeDevOtp`); boot refuses `EXPOSE_DEV_OTP=true` in production; all compose files force `NODE_ENV: production` via `environment:`; `.env.example` no longer enables it and warns.
- **Regression tests:** `security-units.test.ts` ("devCode exposure fails closed", boot refusal), `security-hardening.test.ts` ("never returns the OTP…"). Executed, passing.
- **Note for developers:** the Playwright e2e suite now needs the API started with `EXPOSE_DEV_OTP=true` (clear failure message added).

### VAYA-SEC-002 — High — OTP brute force, plaintext storage, non-atomic single use
- **Location:** `auth.service.ts` (`requestOtp`, `consumeValidOtp`), `db/schema/users.schema.ts` (`otp_codes`). CWE-307/CWE-256/CWE-362; ASVS 2.7.
- **Vulnerability:** every resend added another simultaneously-valid code; no per-code or per-phone attempt counter; code stored as plaintext `varchar(6)`; find-then-update let two concurrent verifies both succeed.
- **Attack:** with the (fake) per-phone limit bypassed (SEC-007), guess codes against a victim's number at volume; with N valid codes the hit rate scales by N. A DB/backup read yields live codes.
- **Fix (done):** HMAC-SHA256 storage (migration `0029`), exactly one live code per phone, atomic per-code attempt reservation (`UPDATE … WHERE attempts < 5 RETURNING`), per-phone lockout (10 guesses / 15 min across codes; also blocks requesting fresh codes), atomic consume. Bounds guessing to ≲960/day/number (<0.1 %).
- **Tests:** `security-units.test.ts` (policy, executed ✔), `otp-hardening.integration.test.ts` (**DB-UNVERIFIED**), `security-hardening.test.ts` (route-level 429, executed ✔).
- **Trade-off:** an attacker can lock a victim's number out for ≤15 minutes (targeted DoS). Accepted; standard for OTP flows.

### VAYA-SEC-003 — High — Google sign-in account takeover
- **Location:** `auth.service.ts` (`findOrCreateGoogleUser`). CWE-287/CWE-345; OWASP A07.
- **Vulnerability:** linked by `email` without checking Google's `email_verified`, and the link `UPDATE` overwrote `google_id` unconditionally.
- **Attack:** a Google identity whose (unverified) email equals the victim's is linked to — or replaces the Google identity of — the victim's VAYA account.
- **Fix (done):** pure `decideGoogleAccountLink`: unverified email ⇒ never link, never stored; an account bound to another Google id ⇒ 409; the link `UPDATE` carries `AND google_id IS NULL`.
- **Tests:** `security-units.test.ts` (decision table ✔ executed); two new cases in `google-auth.integration.test.ts` (**DB-UNVERIFIED**).

### VAYA-SEC-007 — High — Rate limits not actually per-phone; `trustProxy: true`; SMS pumping
- **Location:** `auth.routes.ts`, `admin-auth.routes.ts`, `app.ts` (`trustProxy: true`). CWE-770/CWE-348; API4.
- **Vulnerability:** `keyGenerator: request.body.phone ?? request.ip` executes in `onRequest`, before body parsing ⇒ always the IP. `trustProxy: true` lets any client set its own IP via `X-Forwarded-For`. Result: no effective limit on OTP requests/verifies/admin logins, and no per-IP cap on distinct numbers (SMS toll-fraud / pumping — a direct money cost).
- **Fix (done):** `lib/rate-limit.ts` `keyedRateLimit` (a `preHandler`, body available) layered with a per-IP `config.rateLimit`; `trustProxy` is now a hop count (1 in production behind Caddy, none otherwise; boot refuses `TRUST_PROXY=true`). Also caught during testing: `createRateLimit` returns `isAllowed:false` for every counted request — verdict is `isExceeded`.
- **Tests:** `security-hardening.test.ts` — one phone from rotating IPs is capped; one IP cannot pump many numbers; rotating `X-Forwarded-For` buys nothing. Executed ✔.

### VAYA-SEC-014 — High — Vulnerable dependencies
- `pnpm audit --prod`: 3 critical / 32 high / 17 moderate. Relevant to shipped server code: `fast-jwt` (via `@fastify/jwt` 9.x; three advisory-**Critical** JWT issues), `@fastify/static` (path traversal, High — this app serves `/uploads/` with it), `fastify`, `fast-uri`, `drizzle-orm`, `postcss` (website build).
- **Reachability honesty:** the `fast-jwt` criticals (GHSA-gmvf-9v4p-v8jc, GHSA-rp9m-7r4c-75qg) require an async key resolver returning `''` or a custom `cacheKeyBuilder`; VAYA uses a static `secret`, so they were **not reachable in this configuration** — patched regardless.
- **Fix (done):** `@fastify/jwt` 10.2, `@fastify/static` 10.1, `fastify` 5.12.5, `@fastify/swagger`, plus `pnpm.overrides` for transitive `fast-uri`, `@fastify/static`, `postcss`. `pnpm audit --prod`: **0 critical; API/website runtime tree clean except `drizzle-orm`**.
- **Remaining:** `drizzle-orm` 0.33 (GHSA-gpj5-g38j-94v9, SQL-identifier escaping; **not reachable** — no user-controlled identifiers anywhere, all values parameterized) — upgrade to ≥0.45.2 needs the DB-backed suite in CI to validate; the other 18 High / 7 Moderate (final `pnpm audit --prod`: 0 critical / 19 high / 7 moderate / 2 low) are in Expo/React-Native build tooling (`@xmldom`, `js-yaml`, `image-size`, …), not in shipped runtime code.

## 3. Medium and Low findings

Legend: ✔ fixed + test executed · ◐ fixed, test needs DB (DB-UNVERIFIED) · ✖ remaining.

| ID | Sev | Finding | Location | Status |
|---|---|---|---|---|
| SEC-004 | Med | **Trip completion abuse.** Either party could `POST /trips/:id/complete` while `scheduled`, hours before departure, unlocking ratings, incrementing `tripCount` and feeding the trust tier; unguarded update also allowed double side-effects. | `trips.service.ts` `completeTrip` | ✔ `canCompleteTripNow` (units) + ◐ integration fixture. **Residual:** two colluding accounts can still start→board→complete a real ride instantly; see SEC-021. |
| SEC-005 | Med | **Admin auth.** Login limit keyed on raw email string (case variants = fresh budget) and never actually per-email (SEC-007); admin JWT never re-checked against DB, so a deleted/demoted admin kept working for the 4 h TTL; unbounded password length before scrypt. | `admin-auth.routes.ts`, `app.ts` | ✔ role/existence re-read per request (DB), normalized per-email + per-IP limits, `password ≤ 256`. Test executed for limits; DB re-read is ◐. |
| SEC-006 | Low | **Duplicate booking race** — read-then-insert, no constraint. | `bookings.service.ts` `createBooking` | ◐ final check+insert under a per-(rider,ride) advisory lock. |
| SEC-008 | Med | **`/metrics` public** (route names, traffic, error rates); Caddy proxied it to the internet. | `metrics.routes.ts`, `Caddyfile` | ✔ bearer `METRICS_TOKEN`; 404 in production if unset; blocked at Caddy. |
| SEC-009 | Med | **Client-supplied file references stored verbatim** (`avatarFileUrl`, `photoFileUrl`, KYC `fileUrl`): any external URL became a profile image (viewer IP/timing leak); account deletion `storage.remove`d whatever these held (delete another user's public photo). | `users.service.ts`, `drivers.service.ts` | ✔ reference must be `<uuid>.<ext>` under the upload areas and is *rebuilt* server-side; deletion skips files referenced elsewhere. **Residual:** no per-upload ownership table (an attacker can still point at a victim's *public* photo by name). |
| SEC-010 | Med | **Upload content trusted from client** (MIME + extension only); presigned PUT has no size bound. | `uploads.routes.ts` | ✔ relay uploads magic-byte-sniffed (JPEG/PNG/WEBP/HEIC/PDF). **Residual (needs infra):** presigned direct uploads bypass the API — need bucket-side `nosniff`/CSP headers and a presigned-POST size policy. |
| SEC-011 | Med | **Anonymous / unmetered expensive endpoints:** geocoding (paid Google Places), `/matching/search` (PostGIS + up to 15 live routing calls), routing previews, booking/message/report/upload creation had only the (spoofable) global 100/min. | route modules | ✔ named per-route limits in `RATE_LIMITS` (rationale in file). Autocomplete cutoff tested ✔. |
| SEC-012 | Med | **WebSocket & logs.** Handshake accepted any JWT (admin tokens, OAuth `state` token), never re-checked account status, and Fastify logged `?token=<JWT>`, OAuth `code`/`ticket` in clear. Also: the OAuth `state` JWT (same secret) verified as a bearer token and 500'd. | `trips.routes.ts`, `config/logger.ts`, `app.ts` | ✔ token type/subject validated; account status re-checked every 60 s; secrets redacted from logs (verified end-to-end through Fastify); `authenticate` rejects non-UUID `sub` and unknown users. |
| SEC-013 | Low | `seatsTotal` (1–8) not bounded by the vehicle's `seatCount`. | `rides.service.ts` | ◐ `assertSeatsFitVehicle`. |
| SEC-015 | Low | Unbounded inputs: message history reads, analytics `metadata`/coordinates, multipart parts, push-token format (used as Expo `to`). | services / `packages/validation` | ✔ (schemas tested ✔). |
| SEC-016 | Med | **Infrastructure defaults.** Dev/prod-like compose published Postgres (5433) and Redis (6379, no auth) on all interfaces with well-known creds; compose could run with `NODE_ENV=development`; Caddy sent no security headers. | `docker/*` | ✔ loopback binding, forced `NODE_ENV=production`, HSTS/nosniff/frame headers, request-size cap. **Config only — UNVERIFIED on a live host.** |
| SEC-017 | Low | Swagger UI + `openapi.json` and `/health` (environment, version, latencies) public in production. | `app.ts`, `health.routes.ts` | ✔ docs off in production unless `ENABLE_API_DOCS=true`; health trimmed. |
| SEC-018 | Low | Admin reads of KYC documents (incl. selfie) and queue-job retries not audit-logged. | `admin.routes.ts` | ◐ `kyc_document_viewed`, `queue_job_retried`. |
| SEC-025 | Low | Marketing site sent no security headers; `X-Powered-By` on. | `apps/website/next.config.mjs` | ✔ (build verified). CSP not added — needs browser verification. |
| SEC-019 | Med | **Public PII exposure (product decision).** Unauthenticated `GET /users/:id` returns legal full name and **licence-plate number**; `GET /rides/:id/fellow-passengers` returns first name/avatar/rating of accepted riders; rides/search return exact origin/destination coordinates (a driver's home if that's where they start). | `users.service.ts`, `bookings.service.ts`, matching | ✖ Recommend: require auth for plate + fellow-passengers; coarsen public coordinates until a booking is accepted. |
| SEC-020 | Med | **Session lifetime.** Refresh tokens: 30-day, no rotation/reuse detection, no device/session list; admin JWT in `localStorage` (XSS-readable; CSP is `object-src/base-uri` only). | `auth.service.ts`, `apps/admin` | ✖ Recommend refresh rotation + family revoke; admin session in an `httpOnly; SameSite=Strict` cookie + real CSP. |
| SEC-021 | Med | **Location/reputation integrity.** Trip lifecycle inference and auto-completion trust client GPS (spoofable); collusive pairs can farm ratings with instant real trips. | `trips.service.ts` | ✖ Recommend velocity limits per (driver,rider) pair (relationship signals already exist), min trip duration/distance for reputation credit, accuracy/plausibility checks. |
| SEC-022 | Low | Admin passwords use scrypt with Node defaults (N=16384, below current OWASP guidance N=2¹⁷). No MFA for admin. | `lib/password.ts` | ✖ Needs hash-versioning migration; add TOTP for admins. |
| SEC-023 | Low | Rate-limit counters are in-process memory: limits multiply by replica count and reset on restart. | `app.ts` | ✖ Use the plugin's Redis store when scaling past one API instance. |
| SEC-024 | Low | Google OAuth `state` is a signed JWT not bound to the initiating browser/device (login-CSRF) and no PKCE. | `google-auth.routes.ts` | ✖ Bind `state` to a nonce held by the app; add PKCE. |

## 4. What remains, and why

Six unfixed findings (SEC-019…024). None is an unauthenticated takeover; SEC-019 and SEC-020 are the ones to schedule first. Plus the infrastructure/provider actions in `security-hardening.md` §6 that cannot be done from the repository (WAF/CDN, bucket policy, secret rotation, real backups, MFA provider).

## 5. Informational (verified good — do not regress)

- **INFO-1 SQL injection:** every `db.execute`/`sql\`` uses bound parameters; the one `sql.raw` takes a value from a two-literal union.
- **INFO-2 Secrets:** no key/secret pattern (Google, AWS, Twilio, Sentry, Resend, JWT, private keys) in the working tree; `git log -G` across all branches found no committed `.env`, key, keystore or service-account file and no concrete secret assignments. `.gitignore` covers `.env*`, `google-services.json`. No real credential was found, so **no rotation is triggered by this audit** (the sibling worktree that held real Google Maps keys is untracked local state — confirm they are restricted by API/referrer in Google Cloud).
- **INFO-3 Authorization:** every route module reviewed; ownership is enforced in the service layer for bookings, trips, conversations, notifications, recurring patterns, ratings, ride/stop edits and KYC document reads (404 not 403 on foreign KYC docs).
- **INFO-4 Email templates:** all user-controlled strings are HTML-escaped.
- **INFO-5 Mobile:** tokens in `SecureStore`; iOS ATS exception only when `API_BASE_URL` is `http://`; no WebViews/`dangerouslySetInnerHTML`/eval in app code.

## 6. Verification performed

| Check | Result |
|---|---|
| New security suites (`security-hardening` 16, `security-units` 21, `file-sniff` 4, `security-schemas` 8) | 49/49 pass |
| Full `apps/api` vitest, diffed test-by-test vs pre-change baseline | passing 211 → 248; **0** previously-passing tests broken; the 37 baseline failures are `ECONNREFUSED`/missing-Google-credential failures (no DB here); the only failures not in the baseline are new/renamed DB-backed tests that fail for the same reason |
| `tsc --noEmit` (`api`, `validation`), `eslint` (`api`) | clean (0 errors) |
| `pnpm --filter @vaya/api verify-migrations`, `drizzle-kit generate` | 30 migrations journaled; no schema drift |
| `pnpm --filter @vaya/website build` | passes with new headers |
| `pnpm audit --prod` | critical 3 → 0; see SEC-014 |
| Monorepo `pnpm typecheck` | fails only on `@vaya/api-client` (pre-existing: generated types need a running API) |

**UNVERIFIED (could not run in this environment):** every test needing Postgres/Redis/OSRM (marked ◐/DB-UNVERIFIED); Playwright e2e (needs a live API + `EXPOSE_DEV_OTP=true`); the migration `0029` against a real database; Docker image builds and the Caddy config; mobile behavior on device (the `?token=`-to-log change, and the tighter stricter file-reference contract, should be exercised once from the app: avatar upload, vehicle photo, driver onboarding + resubmission); production behavior of `TRUST_PROXY` behind Caddy.
