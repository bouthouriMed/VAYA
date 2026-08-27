# Admin Platform + Analytics Architecture

## Why this exists

Before this change there was no operational control center at all: `apps/admin` was a literal stub (`echo 'Admin dashboard - not yet implemented'`), no `role`/admin-auth concept existed anywhere in the schema, and there was no analytics-event table, no audit log, and no safety-report mechanism. This document covers the four new pieces built to answer CLAUDE.md's core admin questions: *what is happening, why, where is the marketplace failing, what action should we take.*

## Admin identity — a deliberately separate auth system

`admin_users` (email + `scrypt`-hashed password via Node's built-in `crypto`, no new native dependency) is intentionally **not** a `role` column on `users`. Admin/ops staff aren't marketplace participants — they have no phone/OTP identity and no rider/driver profile — and email+password is the standard internal-tool login pattern; forcing every ops hire through the phone/OTP consumer flow would be the wrong fit. A dedicated `authenticateAdmin` Fastify hook verifies the JWT and requires `payload.type === 'admin'`; the existing consumer `authenticate` hook was extended to explicitly reject an admin token (`payload.type === 'admin'` → 401) — the two token types are cross-rejected in both directions, not just additively separate.

There is no admin signup/self-service flow, matching the "provisioned out-of-band" reality of an internal tool — `db/seed.ts` seeds one dev credential (`admin@vaya.tn`, documented in the progress doc, change it in any real deployment).

## Audit log — append-only, generic, and load-bearing

`audit_logs` (`adminUserId`, `action` (free text, not a closed enum — this table's whole point is to absorb whatever admin action exists today or gets added later without a migration), `targetType`/`targetId`, `reason`, `previousState`/`newState` as jsonb, `createdAt`). Every mutating admin endpoint writes a row via a single `logAdminAction` helper — CLAUDE.md: *"No important admin action should happen invisibly."* It also doubles as the driver-verification review-history requirement (`docs/domain/verification-workflow.md`) rather than needing a second dedicated history table.

## Reports/safety — genuinely greenfield

No reporting or moderation mechanism existed anywhere in this codebase before this change (Open Decision #6 in CLAUDE.md explicitly flagged messaging moderation as deferred — confirmed by grep, zero results). `reports` (`reporterUserId`, optional `reportedUserId`/`bookingId`/`tripId`, a structured `category` enum, freeform `description`, a `status` lifecycle `open → investigating → resolved/dismissed`) is a minimal, real mechanism: `POST /reports` (mobile-facing, any authenticated user) and the admin list/update half (`GET /admin/reports`, `PATCH /admin/reports/:id`). Deliberately not a full trust-and-safety case-management system — a status lifecycle and resolution notes, not workflow automation, escalation rules, or SLA tracking.

## Analytics architecture — one flat event table, not event sourcing

CLAUDE.md is explicit: *"Do NOT build an unnecessarily complex event-sourcing system."* `analytics_events` is a single table, not a per-event-type table set and not a full event-sourced store:

- `eventName` is free text (not a pgEnum) — this table exists specifically to absorb both the 8 canonical search-funnel events (`SEARCH_FUNNEL_EVENT_NAMES` in `@vaya/domain`) and every pre-existing ad-hoc `trackEvent(...)` call site already scattered through the mobile app (previously a dev-only `console.log` no-op — see the mobile-side change) without a schema migration per new event name.
- Dedicated, indexed columns exist only for the dimensions the dashboard actually aggregates on (`corridorKey`+`createdAt`, `eventName`+`createdAt`, `searchId`); everything else lives in a `metadata` jsonb catch-all. This keeps the hot aggregation queries (corridor demand, funnel counts) plain indexed `GROUP BY`s instead of jsonb-scanning.
- `corridorKey` is precomputed **at write time** (`computeCorridorKey`, `packages/domain/src/analytics/corridor-key.ts`) — a pure function bucketing by the leading segment of each side's place label (`"Tunis, Tunisie"` → `"tunis"`), falling back to a coarse ~5.5km lat/lng grid cell only when no label was captured. Precomputing avoids re-deriving the bucket key at query time over every historical row.
- **Retention/privacy**: `userId` is nullable with `ON DELETE SET NULL` — a deleted user's search history doesn't need to cascade-delete analytics rows, but also never becomes an orphaned hard reference. No separately sensitive data is captured beyond what a search already implies (origin/destination area, not exact addresses beyond what the search itself used).
- **Performance isolation**: analytics ingestion (`POST /analytics/events`) is a plain insert with no synchronous validation against `rides`/`users` beyond what auth already established — it can never become a reason a real booking/search action fails, and the admin aggregation queries (`admin-analytics.service.ts`) only ever run on-demand from the admin panel, never on a path a rider/driver waits on.

### Missed-demand: how "Tunis → Sousse, Friday 17:00-20:00, high demand, low supply" actually gets computed

`GET /admin/analytics/corridors` groups `analytics_events` by `corridorKey` over a trailing window: `demand` = count of `search_submitted` events, `matched` = count of `search_results_shown` events with `resultCount > 0`, and `unmetDemand` = zero-result searches plus the residual gap between searches and matches. `supply` is approximated separately, from real `rides` rows (published/full/in_progress) grouped by the same label-bucketing scheme — **a stated limitation, not a hidden one**: a corridor served only via Phase 13's route-passthrough matching (a ride whose own origin/destination is elsewhere but whose real route crosses this corridor) isn't counted as supply here, since it never appears as a ride's own origin/destination label. This under-counts supply for pass-through-heavy corridors rather than over-claiming a false demand gap — the safer direction to be wrong in for an "should we recruit drivers here" signal.

### North Star metric — a recommendation, not a built dashboard tile

CLAUDE.md asks for a "sensible Vaya North Star metric based on the actual marketplace." Given what's now measurable end-to-end (search → match → book → complete, all real), the recommended candidate is **completed rides per week with a real passenger aboard** (i.e. `trips.status = 'completed'` count) — it's the one metric that only increases when the *entire* marketplace loop actually worked: a real search found a real match, a real booking was accepted, and a real trip happened. Weekly active drivers or total searches are tempting but each captures only one side of the loop (supply activity or demand intent) without confirming a transaction actually closed. This is a recommendation for product/business to adopt deliberately, not something silently baked into the dashboard as if already decided.

## What the admin dashboard actually shows

`GET /admin/analytics/overview` — users (total/new/active-by-analytics-activity/passengers/drivers/verified drivers), rides (a real status breakdown: draft/published/full/in_progress/completed/cancelled, plus seats-offered/booked/utilization), and marketplace (searches, searches-with-matches, zero-result count, search→result and result→selection conversion, booking success rate, cancellation rate, completion rate) — every ratio is `null`, not a fabricated `0`, when its denominator is zero. `GET /admin/analytics/search-funnel` returns the 8 funnel stages in order for a step/drop-off visualization. None of these are vanity metrics picked because the data existed — each maps directly to one of CLAUDE.md's explicit "where is demand, where is supply, why are users abandoning" questions.

## Known limitations, stated plainly

- **"Active users" is an analytics-activity proxy** (distinct users with any tracked event in the window), not a rigorous session-based DAU/MAU — this codebase has no session-tracking infrastructure to build a stricter definition on without adding one, which felt like scope creep for this pass.
- **Corridor supply under-counts route-passthrough rides** (see above) — a real, acknowledged limitation, not an approximation error to silently accept.
- **No automated demand-driven driver-recruitment recommendation** — the corridor table surfaces the *signal* (high demand, low supply, by corridor and, via `desired_departure_at`, implicitly by time window through further ad-hoc querying); turning that into an actioned recruitment workflow is a product/ops decision this pass deliberately leaves as a dashboard read, not an automated action.
- **Verified against real infrastructure**: admin login, verification queue/approve/decline, ride listing, and the full analytics-ingestion → corridor-aggregation → search-funnel path were all exercised via real HTTP requests against a real Postgres instance — see `apps/api/src/modules/admin/__tests__/` and `apps/api/src/modules/analytics/__tests__/`.
