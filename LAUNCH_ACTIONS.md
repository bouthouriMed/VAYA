# VAYA — Launch Actions (external, human-only)

Everything in this file needs a real account, real credentials, a legal/product decision, or a physical device — none of it can be completed from inside the repo. Everything that *could* be completed from inside the repo has been (see `PRODUCTION_READINESS.md` for the full account of what was fixed this session, and `RUNBOOK.md` for how to operate the result). This list is the entire remaining gap between "the code is ready" and "real users can sign up."

Each item: **exact action → why → exact credential/config → where → how to verify.**

---

## P0 — blocks launch entirely

### 1. Provision production Postgres
- **Action**: Create a managed Postgres 16+ instance with the PostGIS extension available (e.g. AWS RDS/Aurora with PostGIS, Supabase, Neon, Render Postgres, Crunchy Bridge — any provider that supports `CREATE EXTENSION postgis`).
- **Why**: The app has no database without this. Migration `0014` requires PostGIS specifically — a plain Postgres without it will fail that migration.
- **Credential/config**: `DATABASE_URL` (format `postgresql://user:pass@host:port/dbname`).
- **Where**: Set as an environment variable on whatever runs `docker/api.Dockerfile`/`worker.Dockerfile` (or your chosen orchestrator's secret store).
- **Verify**: `pnpm --filter @vaya/api preflight` (with `DATABASE_URL` exported) reports `✓ Database (DATABASE_URL): reachable`. Then `pnpm --filter @vaya/api db:migrate` should complete with no errors, followed by `pnpm --filter @vaya/api verify-migrations` (checked automatically in CI too).

### 2. Provision production Redis
- **Action**: Create a managed Redis instance (ElastiCache, Upstash, Redis Cloud, etc.). TLS-enabled (`rediss://`) is supported natively.
- **Why**: Without it the app still boots (degrades gracefully) but push/email notifications, the recurring-pattern scan, and rate-limit backing all silently stop working — a real, user-visible functionality loss, not a crash.
- **Credential/config**: `REDIS_URL`.
- **Where**: Same secret store as above.
- **Verify**: `pnpm --filter @vaya/api preflight` reports `✓ Redis (REDIS_URL): reachable`.

### 3. Generate a real JWT_SECRET
- **Action**: `openssl rand -base64 48` (or equivalent), save the output.
- **Why**: The app **refuses to boot in production** without a real one (`config/env.ts`'s `assertProductionSafe`) — this was a real vulnerability the first pass fixed (a hardcoded, publicly-readable default that let anyone forge admin tokens).
- **Credential/config**: `JWT_SECRET` (32+ characters, must not be the literal string `dev-insecure-jwt-secret-change-in-production`).
- **Where**: Secret store.
- **Verify**: The app boots. If it doesn't, the boot log names exactly this as the reason.

### 4. Provision Twilio for OTP/SMS
- **Action**: Create a Twilio account, buy/verify a sending phone number, get the Account SID + Auth Token.
- **Why**: The app **refuses to boot in production** without these — before this session, OTP codes were only ever logged to the server console, meaning no real user could ever sign in.
- **Credential/config**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
- **Where**: Secret store. (Twilio console: https://console.twilio.com)
- **Verify**: `pnpm --filter @vaya/api preflight` makes a real authenticated call to Twilio's API and reports `✓ Twilio credentials: verified against Twilio API`. Then do one real phone sign-in on a test device/number and confirm the SMS arrives.

### 5. Provision S3 (or S3-compatible) storage for KYC documents/photos
- **Action**: Create a bucket (AWS S3, Cloudflare R2, MinIO, Backblaze B2 — anything S3-API-compatible) with an IAM user/access key scoped to just that bucket.
- **Why**: The app **refuses to boot in production** without this. Before this session, every KYC document and profile photo was written to the API container's own local disk — permanently lost on every redeploy/restart.
- **Credential/config**: `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; add `S3_ENDPOINT` + `S3_FORCE_PATH_STYLE=true` if using a non-AWS provider (R2/MinIO); optionally `S3_PUBLIC_URL_BASE` if a CDN sits in front.
- **Where**: Secret store.
- **Verify**: `pnpm --filter @vaya/api preflight` makes a real `HeadBucket` call and reports `✓ S3 storage: bucket "..." reachable and accessible`. Then do one real KYC document upload through the app and confirm it's retrievable afterward (not lost on a redeploy).

### 6. Publish a real Terms of Service and Privacy Policy — content drafted, human steps remain
- **Status (2026-09-15)**: Real Terms & Conditions and a Privacy Policy now exist — `docs/legal/terms-and-conditions.md`/`privacy-policy.md` (French, canonical), rendered in-app in fr/en/ar at `apps/mobile/app/legal/{terms,privacy}.tsx`, and linked from `sign-in.tsx`'s previously-dead disclaimer text and from the profile screen. The remaining action items below are now specifically about what's still needed, not about writing the content from nothing.
- **Action**: (a) Have a licensed Tunisian lawyer review both documents — the cost-sharing/intermediary framing in CGU Article 4 carries real legal weight in Tunisia specifically (no carpooling-specific statute exists; see `docs/legal/README.md`'s "Why this drafting approach" section for the full reasoning and enforcement-risk citations) and deserves real counsel, not just an AI-researched draft. (b) Have the Arabic translation reviewed by a native legal-Arabic speaker. (c) Publish the final content at a real, permanently-reachable public URL (the in-app screens alone don't satisfy the app stores' requirement for a URL). (d) Fill in the bracketed placeholders (registered entity name, RNE number, matricule fiscal, registered address, INPDP contact details) once VAYA's legal entity is actually registered.
- **Why**: **Both the Apple App Store and Google Play require a working, public Privacy Policy URL to submit an app; submission is not possible with only an in-app screen.** The content itself, while substantive, was AI-drafted from public research, not legal advice.
- **Credential/config**: N/A — this is content and legal review, not a credential. Needs a hosting location for the final public URL (can be a static page, doesn't need to be in this repo).
- **Where**: Once the URL exists, add it to both store listings' required Privacy Policy URL field. `docs/legal/README.md` tracks this as an explicit open checklist item.
- **Verify**: The URL resolves publicly; both store listing forms accept it; counsel has signed off on the Article 4 cost-sharing framing specifically.

### 7. Account deletion — done; data export remains open
- **Status (2026-09-15)**: `DELETE /users/me` now exists (`apps/api/src/modules/users/`), soft-deletes and anonymizes the account (mirroring the existing `suspendedAt` pattern — a real hard delete was confirmed unsafe, since it would cascade into other users' bookings), purges KYC files from storage for real, revokes every session, and is blocked with a 409 while the user has an active booking/ride. Full reasoning and verification: `PRODUCTION_READINESS.md` §13.
- **Action remaining**: Data *export*/portability (a GDPR/INPDP right distinct from deletion) was out of this pass's scope and still doesn't exist. Either scope a follow-up implementation, or explicitly accept that gap as a known risk before launch.
- **Why**: GDPR's right to portability (and Tunisia's INPDP access-right equivalent, Loi 2004-63 Art. 32) has no technical way to be fulfilled for a data-export request today — only access (in-app) and erasure (now built) are covered.
- **Credential/config**: N/A.
- **Where**: A future implementation session, scoped the same deliberate way deletion was.
- **Verify**: N/A until built.

### 8. Set up automated Postgres backups with a tested restore
- **Action**: Enable your Postgres provider's automated backup/PITR feature (most managed providers have this built in — RDS, Supabase, Neon, etc. all do). Then **actually restore a backup to a scratch instance once** to confirm it works.
- **Why**: No backup strategy exists today — the local dev `docker-compose.yml` uses a plain Docker volume with no snapshot mechanism, and nothing in this repo automates a production backup. "We have backups" that have never been restored is not a verified backup strategy.
- **Credential/config**: Provider-specific (usually a dashboard toggle + retention window setting, not a repo-level credential).
- **Where**: Your Postgres provider's console.
- **Verify**: A real restore, to a real scratch database, that you actually queried afterward to confirm the data is intact.

---

## P1 — should be done before real users, not launch-blocking in the strictest sense

### 9. Confirm the EAS production build's environment variables are real
- **Action**: In the EAS dashboard (or `eas env:list --environment production`), confirm `API_BASE_URL` is a real `https://` domain (not `localhost`, not blank), and that `GOOGLE_MAPS_ANDROID_API_KEY`/`GOOGLE_MAPS_IOS_API_KEY`/`SENTRY_DSN` are set if you want maps/crash-reporting to work in the shipped app.
- **Why**: These live only in the EAS dashboard — invisible to a repo audit. A production build silently pointed at `localhost` would build and pass review, then be unable to reach any backend on a real device.
- **Credential/config**: `API_BASE_URL`, `GOOGLE_MAPS_ANDROID_API_KEY`, `GOOGLE_MAPS_IOS_API_KEY`, `SENTRY_DSN` (mobile), `GOOGLE_SERVICES_JSON` (as an EAS file-type env var, or the actual `google-services.json` file for local builds).
- **Where**: https://expo.dev → your project (`bouthourimohamed/vaya`) → Environment variables, scoped to the `production` profile in `eas.json`.
- **Verify**: `eas env:list --environment production` shows real values. Then a real production build (`eas build --profile production`) installed on a device actually reaches the backend.

### 10. Real device QA pass
- **Action**: Install a real (not Expo Go — a dev-client or production build) build on a physical iOS device and a physical Android device. Walk through: sign-in/OTP, map rendering, a KYC document capture, push notification receipt, a deep link.
- **Why**: Every "not verified on-device" item this whole session's work (and every prior session's, per `CLAUDE.md`'s own history) carries the same caveat — nothing here has ever run outside a sandboxed CI-like environment.
- **Credential/config**: Real Apple/Google developer accounts, a real device.
- **Where**: N/A.
- **Verify**: It's the verification step itself.

### 11. Provision a production domain + HTTPS certificate for the API
- **Action**: Register/point a real domain at wherever the API is deployed, with a valid TLS certificate (Let's Encrypt via your host, or a managed cert from your cloud provider/CDN).
- **Why**: No production domain exists yet — the app has only ever run on `localhost`/LAN IPs. Once this exists, `apps/mobile/app.config.js`'s iOS ATS exception (which disables HTTPS enforcement) **automatically stops applying** — it's already wired conditionally on `API_BASE_URL` being `http://` — so this single change also closes a real security gap with zero further code work.
- **Credential/config**: DNS records, a TLS cert (usually automatic via your host/CDN).
- **Where**: Your DNS provider + hosting/CDN.
- **Verify**: `https://your-domain/api/v1/health` resolves with a valid cert. A production mobile build (with `API_BASE_URL` updated to match, see #9) no longer needs the ATS exception.

### 12. Set up minimal alerting
- **Action**: Configure Sentry alert rules (e.g., "notify on any new issue type" or "notify if error rate exceeds X/hour") and a separate uptime check (UptimeRobot, Better Uptime, Pingdom, or your cloud provider's own health-check-based alerting) against `GET /api/v1/health`.
- **Why**: Nothing pages a human today. `/health`, `/metrics`, and the admin Background Jobs page (`GET /admin/queue/failed`) all exist and are useful, but only if someone is actively watching them.
- **Credential/config**: A Sentry account (see #13) + an uptime-monitoring account, each with their own notification channel (email/Slack/PagerDuty).
- **Where**: Sentry dashboard; your chosen uptime monitor's dashboard.
- **Verify**: Trigger a real test alert (Sentry has a "send test event" button; most uptime monitors let you force-check) and confirm it actually reaches the intended person/channel.

### 13. Create a Sentry project (API + mobile)
- **Action**: Create a Sentry account/organization, create two projects (one Node, one React Native), grab each DSN.
- **Why**: Both `apps/api/src/config/monitoring.ts` and `apps/mobile/src/services/monitoring/sentry.ts` are fully wired and tested this session — gated behind a DSN, currently unset, so currently a safe no-op. Without a real DSN, there is zero production error visibility beyond logs (API) or nothing at all (mobile — an unhandled exception on a user's phone is invisible today).
- **Credential/config**: `SENTRY_DSN` (API, in the API's secret store), `SENTRY_DSN` (mobile, as an EAS environment variable — see #9).
- **Where**: https://sentry.io → new project (per platform).
- **Verify**: `pnpm --filter @vaya/api preflight` reports the DSN "looks well-formed"; trigger a real error in each app and confirm it appears in the corresponding Sentry project.

### 14. (Optional but recommended) Enable Sentry source-map upload for mobile
- **Action**: In the same Sentry project as #13, create an internal integration/auth token with the right scopes, note your Sentry org slug + project slug.
- **Why**: `app.config.js`'s Sentry Expo plugin is currently configured with `disableAutoUpload: true` — deliberately, because this session had no real Sentry org/token to safely test source-map upload against, and a build-time network call to a nonexistent org would have risked failing every build. Without this, JS errors reported from a production mobile build show minified stack traces, which are hard to debug.
- **Credential/config**: `organization`, `project`, `authToken` (Sentry's own auth token, not `SENTRY_DSN`).
- **Where**: `apps/mobile/app.config.js`'s `@sentry/react-native/expo` plugin entry — add these three fields and remove (or set `false`) `disableAutoUpload`.
- **Verify**: A production EAS build's logs show a successful source-map upload step; a real error reported from that build shows a real (non-minified) stack trace in Sentry.

### 15. App Store / Google Play submission credentials
- **Action**: Set up App Store Connect API key (Apple) and a Google Play service account JSON (Android), both scoped for `eas submit`.
- **Why**: `eas.json`'s `submit.production` profile is present but empty — building an app is not the same as being able to submit it.
- **Credential/config**: Apple: an ASC API key (`.p8` file + Key ID + Issuer ID). Google: a service account JSON with Play Console API access.
- **Where**: `eas credentials`, or directly in `eas.json`'s `submit` section (EAS supports referencing these via its own credential storage, which is preferred over committing paths to the repo).
- **Verify**: `eas submit --profile production` actually reaches the respective store's upload API without an auth error.

### 16. Review the generated app icon/splash with a real designer
- **Action**: This session generated a real, on-brand (navy `#2E3B42` + sage `#7FA491`, matching the app's existing documented palette) icon/splash — a simple geometric "V" monogram — since none existed and Expo's default placeholder was shipping. It's a genuine, functional icon, not a fabricated brand identity, but it was generated programmatically, not designed. Have a real designer confirm it (or replace it) before a real store listing goes live.
- **Why**: First impressions (store listing thumbnail, home-screen icon) matter, and this is exactly the kind of asset worth a human design pass, not a placeholder assumption.
- **Credential/config**: N/A — swap `apps/mobile/assets/icon.png`/`adaptive-icon-foreground.png`/`splash-icon.png`/`favicon.png` for final versions when ready (same filenames, `app.config.js` doesn't need to change).
- **Where**: `apps/mobile/assets/`.
- **Verify**: A real build shows the new icon on a device home screen and app switcher.

### 17. Branch protection on `main`
- **Action**: In GitHub repo settings, require the `.github/workflows/ci.yml` `build-and-test` and `docker-build` jobs to pass before merging to `main`, and require at least one review.
- **Why**: CI now exists (it didn't before this session) but a GitHub Actions workflow file alone doesn't block a merge — that's a separate repo setting this session has no access to configure.
- **Credential/config**: N/A — a GitHub admin permission, not a secret.
- **Where**: GitHub repo → Settings → Branches → Branch protection rules for `main`.
- **Verify**: Attempt to merge a PR with a deliberately failing check and confirm GitHub blocks it.

---

## P2 — real but lower urgency

### 18. Container registry + hosting/orchestrator decision
- **Action**: Choose where `docker/api.Dockerfile`/`worker.Dockerfile` actually run (ECS/Fargate, Cloud Run, Fly.io, Railway, a plain VM with `docker compose -f docker/docker-compose.prod.yml`, etc.) and a registry to push images to (ECR, GHCR, Docker Hub).
- **Why**: Both Dockerfiles exist and are verified to build correctly (CI now builds both on every push — see `.github/workflows/ci.yml`'s `docker-build` job), but nothing in this repo picks a deploy target — that's an infrastructure decision this audit can't make on your behalf.
- **Credential/config**: Registry credentials, orchestrator-specific deploy config.
- **Where**: Wherever you choose.
- **Verify**: A real deployed instance passes its `HEALTHCHECK` and the smoke test (`API_BASE_URL=<real-url> pnpm --filter @vaya/e2e smoke`).

### 19. Google OAuth production credentials
- **Action**: If Google sign-in should work in production (currently optional — the app falls back to phone/OTP if unset), create a real OAuth 2.0 client in Google Cloud Console with the production redirect URI registered.
- **Credential/config**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` (must exactly match what's registered in GCP).
- **Where**: https://console.cloud.google.com/apis/credentials
- **Verify**: A real Google sign-in completes end-to-end from a production build.

### 20. Google Maps/Places/Routes production API keys
- **Action**: If not already done for dev, create production-scoped keys (separate from any dev key, with proper HTTP-referrer/app restrictions).
- **Credential/config**: `GOOGLE_MAPS_SERVER_API_KEY` (or the split `GOOGLE_PLACES_API_KEY`/`GOOGLE_ROUTES_API_KEY`/`GOOGLE_GEOCODING_API_KEY`) for the API; `GOOGLE_MAPS_ANDROID_API_KEY`/`GOOGLE_MAPS_IOS_API_KEY` for mobile (see #9).
- **Where**: https://console.cloud.google.com/
- **Verify**: `pnpm --filter @vaya/api preflight` doesn't directly check this (no dedicated Google check exists yet), but a real search/matching request in the app should return real routing data, not the haversine-fallback estimate (`routeIsEstimate: true` in the response is the tell).

### 21. Resend (transactional email) production API key
- **Action**: If transactional email should send for real (currently optional — falls back to logging), create a Resend account and verify your sending domain.
- **Credential/config**: `RESEND_API_KEY`, `EMAIL_FROM` (must be on a verified domain).
- **Where**: https://resend.com
- **Verify**: A real booking-acceptance email arrives in a real inbox.

---

## Already done — do not redo, just confirm the values are real when you configure them

Everything above is wired, tested (where testable without live credentials), and — for the boot-blocking ones (JWT/Twilio/S3/CORS) — the app will **refuse to start** in production if it's missing, so a misconfiguration fails loudly at boot rather than silently in front of a user. `pnpm --filter @vaya/api preflight` (run it against the real target environment's env vars before any deploy) checks reachability/validity for everything in the P0 section above in one pass — see `RUNBOOK.md` §4 for exactly when to run it.
