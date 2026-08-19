# Phase 12 — Scale Hardening

**Horizon:** SCALE · **Estimated complexity:** High

## Objective

The set of changes that become justified once VAYA has real traffic at the tens-of-thousands-to-hundreds-of-thousands-of-users range, per `docs/architecture/overview.md`'s NOW/NEXT/SCALE strategy. **Do not begin this phase speculatively** — each item below should be triggered by an observed, measured need (real latency numbers, real concurrent load, real abuse patterns), not undertaken in advance of evidence. This phase's Definition of Done is written as "triggered and completed," not "completed by a deadline."

## Prerequisites

Phases 1-11 substantially complete and in real production use with measurable traffic. This phase is explicitly out of scope for VAYA's current stage — it's documented now so a future session knows what "next" looks like, per the task brief's requirement to distinguish NOW/NEXT/SCALE and explain when complexity becomes justified.

## Exact scope (each item independently triggerable)

1. **PostGIS migration**: replace the application-level haversine scan in `matching.service.ts` with real spatial indexes (`GIST`) once measured search latency under real concurrent load degrades — instrument first (Phase NEXT's observability work), migrate only once the data justifies it.
2. **Read replicas**: separate search/matching read traffic from the booking/ride-creation write path once write contention or read load on the primary becomes a measured bottleneck.
3. **Idempotency keys**: add an `Idempotency-Key` header contract to booking creation/acceptance once mobile-network retry behavior is shown to cause real duplicate-request issues (the API contract should reserve this header now, per the architecture doc, so adding real enforcement later isn't a breaking change).
4. **Formal abuse-prevention layer**: device/account velocity limits beyond Phase 1's basic rate limiting, once real abuse patterns (fake ride spam, booking-request flooding) are actually observed — not built against imagined threats.
5. **OSRM scaling**: horizontal scaling or a managed routing provider if a single self-hosted OSRM instance becomes a bottleneck under real request volume.
6. **Multi-region considerations**: only relevant if VAYA expands beyond Tunisia — explicitly out of scope until that's a real product decision, not an engineering default.

## User flows

None — this phase is infrastructure, invisible to end users except as improved reliability/latency under load.

## Screens

None.

## UX behavior

None directly — indirectly, degraded search latency or booking failures under load are the symptoms this phase prevents.

## Design-system work

None.

## Frontend

Minimal — possibly a client-side idempotency-key generation utility for booking requests.

## Backend

`apps/api/src/modules/matching` (PostGIS query rewrite), infrastructure/deployment config (read replicas, OSRM scaling), `apps/api/src/middleware` (abuse-prevention layer).

## Database

PostGIS extension enablement, spatial column types/indexes replacing plain `doublePrecision` lat/lng for geospatial query performance (schema migration, not a conceptual model change — `docs/domain/model.md`'s entities are unaffected).

## API

Idempotency-Key header support on mutating endpoints (`POST /bookings`, `POST /rides`, `PATCH /bookings/:id/accept`).

## Business rules

None new — this phase preserves existing business rules under higher load, it doesn't change them.

## Testing

- Load testing (not present anywhere in the current test suite) establishing baseline latency/throughput numbers before and after each optimization — this phase should produce load-test infrastructure as a deliverable, not just the optimizations themselves.
- Idempotency test: duplicate requests with the same key produce exactly one booking, not two.

## Analytics

- Latency percentiles (p50/p95/p99) on matching/booking endpoints, tracked continuously from whichever observability tooling NEXT-phase work introduces — this phase's trigger conditions are read directly from these metrics.

## Definition of Done

Each sub-item has its own trigger condition and completion criteria — this phase is not "done" as a single unit. Track sub-items independently in the status tracker (`docs/roadmap/README.md`) as they're triggered by real evidence, e.g.:
- [ ] PostGIS migration — triggered when: matching p95 latency exceeds a defined threshold under real load. Completed when: spatial index confirmed via `EXPLAIN`, latency improvement measured.
- [ ] Read replicas — triggered when: write contention or read load measured on primary. Completed when: search/matching traffic routes to replica, write path unaffected.
- [ ] Idempotency enforcement — triggered when: duplicate-booking incidents observed in production. Completed when: header enforced, test passes.
- [ ] Abuse-prevention layer — triggered when: real abuse pattern observed. Completed when: the specific observed pattern is mitigated.

## Dependencies

Nothing depends on this phase being done early — that's the point. It exists so complexity is added in the right order, not so it's done "eventually" on a fixed timeline.

## Risks

The primary risk this phase manages is the opposite of typical technical debt: **premature optimization**. Starting any of these items before its trigger condition is observed is itself the risk — it spends engineering effort hardening for a scale VAYA hasn't reached yet, at the cost of the product work in Phases 1-11 that actually gets it there.
