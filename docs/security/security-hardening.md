# VAYA Security Hardening Guide

What the 2026-09-21 security sprint changed, the configuration it now expects, and the actions that need a human or infrastructure. See `security-audit.md` for findings.

## 1. New/changed environment variables (`apps/api`)

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | **Set `production` in every real deployment.** Compose files now force it (`environment:` beats `env_file:`). |
| `EXPOSE_DEV_OTP` | unset | Local-dev only: return the OTP in the response. Needs `NODE_ENV=development` **and** no Twilio credentials. Boot refuses it in production. Playwright e2e needs it. |
| `TRUST_PROXY` | none (dev/test), `1` in production | Reverse-proxy hops trusted for `X-Forwarded-For` (rate-limit identity). Boot refuses `true`. If you put a CDN/WAF in front of Caddy, raise it to match the real hop count. |
| `METRICS_TOKEN` | unset | Bearer token for `GET /metrics` (≥16 chars). Unset in production ⇒ the endpoint is disabled. Prometheus: `authorization: {credentials: <token>}` scraping `api:3000` over the Docker network. |
| `ENABLE_API_DOCS` | off in production | Serve Swagger UI/`openapi.json`. |
| `JWT_SECRET` | — | Must be ≥32 random chars in production (already enforced). It also keys the OTP HMAC — **rotating it invalidates in-flight OTPs and all sessions**. |

## 2. Rate limits (security controls, not product numbers)

Defined once in `apps/api/src/lib/rate-limit.ts` (`RATE_LIMITS`), each with its rationale. Per-client-IP via `config.rateLimit`; body-keyed limits (phone/email) via `keyedRateLimit` in `preHandler`.

| Surface | Limit | Reason |
|---|---|---|
| OTP request | 10/min/IP, 100/h/IP, **3/10 min/phone** | SMS cost, SMS pumping, SMS-bombing one number |
| OTP verify | 20/min/IP, **10/10 min/phone**, plus DB lockout (5 guesses/code, 10 per 15 min/phone) | Brute force of a 10⁶ code space |
| Admin login | 20/10 min/IP, **5/10 min/email** (normalised) | Credential guessing |
| Refresh / logout / OAuth exchange | 30/min, 30/min, 20/min | Token abuse |
| Geocoding autocomplete / details / reverse (anonymous) | 60 / 30 / 30 per min | Paid Google Places |
| `/matching/search` (anonymous) | 30/min | PostGIS + up to 15 live routing calls |
| Routing previews, candidate/city stops | 30/min | Routing-engine calls |
| Route options, ride create/publish/cancel | 20/min | Routing calls, marketplace writes |
| Booking create | 20/min | Each request pushes/emails another user |
| Booking accept/decline/cancel/no-show | 30/min | Notification fan-out |
| Message send | 30/min | Spam |
| Reports | 5 per 10 min | Moderation-queue spam |
| Uploads (+presign) | 20/min | Storage cost |
| Analytics ingest / trip GPS (pre-existing) | 60/min, 20/10 s | — |

**Known limit:** counters are in process memory. With N API replicas the effective limit is N×; on restart they reset. Before scaling past one replica, register `@fastify/rate-limit` with a dedicated Redis client (`redis` option, `skipOnError: true`) — tracked as SEC-023.

Gotchas recorded so the next person doesn't repeat them: (1) never read `request.body` in a `keyGenerator` on `config.rateLimit` — it runs before parsing; (2) `app.createRateLimit()` returns `isAllowed:false` for every counted request — use `isExceeded`.

## 3. Deployment checklist (security-relevant)

1. Build `docker/.env.prod` from `apps/api/.env.example`, then **delete** `EXPOSE_DEV_OTP`, `ENABLE_API_DOCS`, set `CORS_ORIGIN` to the real admin origin(s), a fresh `JWT_SECRET` (`openssl rand -hex 32`), `METRICS_TOKEN`.
2. Apply migration `0029_otp_code_hashing` (`pnpm --filter @vaya/api db:migrate`) **before** rolling the new API image — the new code reads `otp_codes.code_hash`. It deletes pending OTP rows (users mid-login just resend).
3. Confirm boot logs contain no "Refusing to start" and (with `NODE_ENV=production`) that `GET /api/v1/openapi.json` and `GET /metrics` (no token) return 404/401 through Caddy.
4. `curl -H 'X-Forwarded-For: 1.2.3.4' https://<api>/api/v1/health` — then hammer `/auth/otp/request` with rotating `X-Forwarded-For` and confirm 429s arrive (proves proxy trust is correct end-to-end).
5. Put Postgres and Redis on a private network (or managed with TLS + auth). Never publish 5432/6379.
6. Run the smoke suite (`tests/e2e/tests/smoke.api.test.ts`) against the deployment.

## 4. Behavioural changes reviewers/clients should know

- **File references:** `avatarFileUrl`, vehicle `photoFileUrl` and KYC `fileUrl` must reference a file returned by this API's own upload endpoints (`/uploads/<uuid>.<ext>`, `/secure-uploads/<uuid>.<ext>`, or the S3 `public/<uuid>.<ext>` URL). Anything else → 400. The stored value is rebuilt server-side. The mobile client already sends exactly what the upload returned; **exercise avatar upload, vehicle photo and driver onboarding/resubmission once on a device**.
- **Trip completion** requires the trip to be `active`/`arriving`, or the ride's departure time to have passed.
- **Ride seats** cannot exceed the vehicle's `seatCount` (`POST/PATCH /rides`).
- **Google sign-in** no longer links on an unverified email; a second Google identity claiming an already-bound email gets 409 `GOOGLE_EMAIL_ALREADY_LINKED`.
- **Push tokens** must match `ExponentPushToken[...]`.
- **OTP verify** may return 429 `OTP_TEMPORARILY_LOCKED` after repeated wrong codes.
- **`GET /health`** no longer includes `environment`, `version` or latencies. `/metrics` needs the bearer token.
- **WebSocket** tracking connections are closed with code 4403 if the account is suspended/deleted mid-trip (client falls back to REST polling).

## 5. Supply chain

- Fixed: `@fastify/jwt` 10 (fast-jwt 6.2.4+), `@fastify/static` 10, `fastify` 5.12.5, `@fastify/swagger`, and `pnpm.overrides` for `fast-uri`, `@fastify/static`, `postcss`. `pnpm audit --prod`: 0 critical.
- **Open:** `drizzle-orm` ≥0.45.2 (not exploitable here, see SEC-014). Do the upgrade on a branch with the Postgres-backed suite running in CI.
- **Recommended CI change:** the `Dependency vulnerability audit` step is `|| true` (informational). Make it fail on `--audit-level=critical --prod` once the mobile-tooling advisories are triaged, so a critical runtime advisory cannot merge silently.
- **Recommended:** pin GitHub Actions by commit SHA and add `permissions: contents: read` to `ci.yml` (not changed here — needs a maintainer decision on the pin policy). No CI secrets are referenced in the workflow.
- Dependency install scripts were **not** audited in depth (only the root `husky` `prepare` script was checked; `HUSKY=0` in images). Consider `pnpm install --ignore-scripts` in CI/Docker plus an explicit allow-list (`onlyBuiltDependencies`).

## 6. Actions that need a human / infrastructure (cannot be done from the repo)

1. **Run migration 0029** and the DB-backed suites (`pnpm --filter @vaya/api test` with Postgres+Redis up) — none of the DB-marked tests in the audit were executed by the auditor.
2. **Start the e2e API with `EXPOSE_DEV_OTP=true`** and run Playwright once.
3. **Object storage:** set `X-Content-Type-Options: nosniff` and a restrictive `Content-Security-Policy: default-src 'none'; sandbox` on the public prefix's responses (bucket/CDN response-header policy); keep `secure/` private; add a bucket lifecycle/size guard — presigned PUT cannot cap object size (move to presigned POST with a `content-length-range` policy).
4. **Google Cloud:** restrict every Maps/Places/Routes/Geocoding key by API and by application (server key by egress IP, mobile keys by package/SHA-1 and bundle id). Keys existed in a sibling local worktree — confirm they are restricted and rotate if they were ever shared.
5. **Twilio:** enable geo-permissions (Tunisia only) and a daily spend cap; this is the backstop for SMS pumping.
6. **Backups/restore drill** for Postgres (still open from `PRODUCTION_READINESS.md`), and an encryption-at-rest confirmation for the DB volume and the KYC bucket.
7. **Decide** SEC-019 (public plate/passenger list/exact coordinates), SEC-020 (refresh rotation + admin cookie session), SEC-021 (reputation anti-collusion signals), SEC-022 (admin MFA), and the analytics location-retention period.
8. **Legal review** of the retention statements in `docs/legal/` against the analytics/location behaviour described in the threat model.

## 7. Tests added

| File | Covers | Ran here |
|---|---|---|
| `apps/api/src/__tests__/security-hardening.test.ts` | Real app via `inject`: per-phone/per-IP OTP limits, XFF spoofing, no `devCode`, admin-login case-variant limit, password length, `/metrics` auth, OAuth-state/admin token confusion, geocoding limit | ✔ |
| `apps/api/src/__tests__/security-units.test.ts` | OTP HMAC/lockout policy, Google link decision, trip-completion guard, file-reference validation, log redaction, env fail-closed/proxy/docs helpers | ✔ |
| `apps/api/src/lib/__tests__/file-sniff.test.ts` | Magic-byte upload sniffing | ✔ |
| `packages/validation/src/__tests__/security-schemas.test.ts` | Admin login, push token, analytics bounds | ✔ |
| `apps/api/src/modules/auth/__tests__/otp-hardening.integration.test.ts` | Hashed storage, single live code, per-code + per-window budgets, atomic consume | ✖ needs Postgres |
| `google-auth.integration.test.ts` (2 new cases), `trips-ratings.integration.test.ts` (regression for premature completion) | DB behaviour | ✖ needs Postgres |
