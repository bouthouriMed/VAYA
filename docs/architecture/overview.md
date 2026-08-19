# Architecture Overview

## System Architecture

VAYA follows a client-server architecture with a clear separation between the mobile client and the backend API.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Mobile App     │────▶│   REST API       │────▶│  PostgreSQL  │
│  (Expo + RN)     │     │  (Fastify + TS)  │     │              │
└──────────────────┘     └──────────────────┘     └──────────────┘
        │                       │                        │
        │                       │                  ┌─────┴─────┐
        │                       │                  │   Redis   │
        │                       │                  │ (optional)│
        │                       │                  └───────────┘
        ▼                       ▼
   Redux Toolkit          Drizzle ORM
   + RTK Query            + Migrations
        │                       │
        ▼                       ▼
  Generated Client        OpenAPI Contract
  (from OpenAPI)
```

## Key Principles

1. **Separation of Concerns**: Each layer has a single responsibility
2. **Contract-First**: API contract (OpenAPI) drives client generation
3. **Feature Orientation**: Code organized by business domain
4. **Infrastructure Boundaries**: Framework code at edges, domain logic in center

## Package Responsibilities

| Package               | Purpose                               |
| --------------------- | ------------------------------------- |
| `@vaya/mobile`        | Expo React Native application         |
| `@vaya/api`           | Node.js REST API server               |
| `@vaya/api-client`    | Generated TypeScript API client       |
| `@vaya/design-system` | React Native UI components and tokens |
| `@vaya/config`        | Shared application constants          |
| `@vaya/validation`    | Shared Zod validation schemas         |
| `@vaya/domain`        | Core domain types                     |
| `@vaya/eslint-config` | Shared ESLint rules                   |

## Infrastructure already in place (verified, not aspirational)

Local dev infra (`docker/docker-compose.yml`) includes more than a typical MVP:

- **Postgres 16** — primary datastore, 14 tables today (`docs/domain/model.md`), stable migration history (2 migration files, no churn).
- **Redis 7** — used for caching (`lib/cache.ts`) around OSRM/geocoding calls, not just provisioned-and-unused.
- **Self-hosted OSRM** with a Tunisia road-network extract (`docker/osrm/prepare.sh` downloads from Geofabrik) — real driving routes, polylines, and ETAs via `lib/routing.ts`, with a documented, working haversine fallback when OSRM isn't running. This is the foundation the ride engine (`docs/domain/ride-engine.md`) builds on.

The matching algorithm (`apps/api/src/modules/matching/matching.service.ts`) already does real polyline-corridor route-overlap scoring, not just radius filtering — see `docs/domain/ride-engine.md` for how it's extended.

## Full current-state audit

See `docs/product/audit.md` for the complete KEEP/IMPROVE/REFACTOR/REPLACE/MISSING classification across screens, design system, backend, and infrastructure.

## Target architecture additions

Beyond what exists today, the roadmap (`docs/roadmap/`) adds:

- `packages/domain/src/pricing` — pricing computation logic (`docs/domain/pricing.md`), consumed by both `rides` and `bookings` API modules, never computed client-side.
- `route_stops` and `pricing_configs` tables (`docs/domain/model.md`) — additive, non-breaking schema changes.
- A background job/queue (BullMQ or equivalent) for notification dispatch — currently the `notifications` table has no delivery mechanism.
- `expo-notifications` integration on the mobile client, with a device-token registration endpoint on the API.
- A `conversations`/`messages` domain for per-trip driver↔passenger communication.

## Scalability strategy: NOW / NEXT / SCALE

Explicit horizons, so architectural complexity is added when justified, not preemptively.

### NOW (current build-out, thousands of users, single region)

- Fix the confirmed overbooking race in `bookings.service.ts` (`acceptBooking`) with a transaction + row lock or atomic conditional update — a correctness bug, not a scale problem, but it gets worse under any real concurrency.
- Add missing indexes: `rides(status, departure_at)` composite (the matching hot-path filter), and indexes on all FK columns across `bookings`, `trips`, `ratings`, `route_stops`. Zero indexes exist today beyond PK/unique.
- Add `@fastify/rate-limit` — not registered today, required before any public exposure.
- Keep geospatial queries as application-level haversine over a time-windowed row fetch (`matching.service.ts`'s current approach) — adequate through the thousands-of-concurrent-published-rides range and far simpler to operate than PostGIS.
- Keep the existing Redis cache usage pattern (cache OSRM/geocoding responses); extend the same pattern to candidate-stop generation results (`docs/domain/ride-engine.md`).

### NEXT (tens of thousands of users, still single region)

- Introduce a background job queue (BullMQ + Redis, already provisioned) for: notification dispatch, recurring-pattern detection (batch job over ride/booking history, populating the already-modeled `recurring_patterns` table), and candidate-stop regeneration for routes whose scoring inputs changed.
- Add PostGIS (or Postgres's built-in `earthdistance`/`cube` extensions as a lighter first step) once the time-windowed application-level scan in `matching.service.ts` starts showing latency under real concurrent search load — instrument and measure before migrating, don't migrate speculatively.
- Add observability: structured request logging is presumably present via Fastify defaults — add latency/error tracking (e.g. OpenTelemetry or a hosted APM) specifically around the matching and pricing endpoints, since those are the highest-fanout, highest-value queries.
- Add analytics event pipeline (no SDK currently in `apps/mobile` — see `docs/product/audit.md` §5) — required by the roadmap's per-phase analytics requirements; a lightweight event-ingestion endpoint feeding a warehouse is sufficient at this stage, no need for a dedicated analytics vendor yet.

### SCALE (hundreds of thousands of users, possible multi-region)

- Full PostGIS adoption with spatial indexes (`GIST`) for stop/ride proximity queries, replacing the application-level haversine scan entirely.
- Read replicas for search/matching queries, separating them from the write path (bookings, ride creation).
- Idempotency keys on booking creation/acceptance (needed once retries from flaky mobile networks become a meaningful fraction of traffic — not needed at NOW/NEXT scale, but the API contract should reserve an `Idempotency-Key` header now so it's not a breaking change later).
- Formal abuse-prevention layer (device/account velocity limits on ride creation and booking requests, beyond basic rate limiting) once real abuse patterns are observed — don't build this speculatively against imagined abuse.
- Revisit the OSRM self-hosting model (single container today) for horizontal scaling or a managed routing provider if request volume outgrows a single instance.

**Explicit non-goal:** none of the SCALE items should be started before NOW is actually done and NEXT's triggers (measured latency, real concurrent load) are observed. Over-engineering for hundreds of thousands of users while the app has zero DB indexes is the wrong order of operations.
