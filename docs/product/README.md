# VAYA Product Documentation

## Vision

VAYA is a carpooling marketplace for Tunisia — a market with no incumbent international carpooling platform (`docs/product/benchmark.md` §8), dominated today by louages (shared intercity minibuses) and informal, undocumented social-carpooling. VAYA's opportunity is to bring a structured, trustworthy, spatially-intelligent alternative to that gap, not to clone BlaBlaCar's long-distance-first model wholesale — the benchmark research suggests Tunisia's trip patterns (dense intra-city/intercity commute corridors) are closer to what Karos/Klaxit solve than what BlaBlaCar's original product solved (`docs/product/benchmark.md` §7).

The product must earn trust through two things it already does unusually well for its stage: a real driver-verification pipeline (live-camera KYC) and a real road-routing foundation (self-hosted OSRM over Tunisia). The roadmap's job is to build the two systems that don't exist yet and are the actual hard part of a carpooling marketplace — the ride engine (route-aware stop selection) and pricing — on top of that foundation, not around it.

## Document index

| Document | Contents |
|---|---|
| [`docs/product/audit.md`](audit.md) | Full current-state audit: every area of the codebase classified KEEP/IMPROVE/REFACTOR/REPLACE/MISSING, with file-level evidence. Read this first. |
| [`docs/product/benchmark.md`](benchmark.md) | BlaBlaCar and world-class carpooling research, labeled FACT/ESTIMATE/ASSUMPTION/HYPOTHESIS. |
| [`docs/product/search-engine-audit-2026-08-23.md`](search-engine-audit-2026-08-23.md) | Deep audit of `matching.service.ts`'s search/matching engine against publicly documented BlaBlaCar architecture — gap analysis, edge-case matrix, and a prioritized (P0-P4) roadmap. Read-only audit, no code changed. |
| [`docs/product/search-engine-audit-v2-active-trip-2026-08-23.md`](search-engine-audit-v2-active-trip-2026-08-23.md) | Second, independently-verified audit + implementation spec: active-trip/live-GPS-route state (found to be entirely unbuilt), booking concurrency (verified atomic and safe, with two real gaps found), detour-matching algorithm design, 1,000-user scale modeling, and a single recommended P0-P4 build order. Read-only, no code changed. |
| [`docs/ux/principles.md`](../ux/principles.md) | The UX rules every future screen follows, and explicit anti-patterns to reject. |
| [`docs/ux/driver-journey.md`](../ux/driver-journey.md) / [`passenger-journey.md`](../ux/passenger-journey.md) | Target end-to-end experiences, with today's gaps noted inline. |
| [`docs/design-system/README.md`](../design-system/README.md) | The formal VAYA design system: actual token values, component inventory, what's missing, enforcement rules. |
| [`docs/domain/model.md`](../domain/model.md) | The verified domain model — every table, every field, source-of-truth mapping, state machines. |
| [`docs/domain/ride-engine.md`](../domain/ride-engine.md) | The route→candidate-stops→validation→ranking→selection system design. |
| [`docs/domain/pricing.md`](../domain/pricing.md) | The bounded, computed pricing architecture. |
| [`docs/architecture/overview.md`](../architecture/overview.md) | System architecture, what infrastructure already exists, NOW/NEXT/SCALE scalability strategy. |
| [`docs/roadmap/README.md`](../roadmap/README.md) | The phased implementation roadmap, status tracker, open decisions, blockers. |

## Product principles

1. **The marketplace's two hardest mechanics — where to stop, what to pay — must never be free-form.** This is the single most important product decision this audit surfaced (`docs/domain/ride-engine.md`, `docs/domain/pricing.md`).
2. **Trust must be visible before commitment, not discovered after.** VAYA has the identity-verification half already; the reputation-surfacing half is a near-term gap (`docs/ux/principles.md` #7).
3. **Build on what's real, don't rebuild what works.** The matching algorithm, the OSRM routing foundation, the domain state machines, and the core design-system primitives are genuine assets — extend them (`docs/product/audit.md`).
4. **Never let a screen show fabricated success.** The single worst UX bug found in this audit is a real API call followed by fake rendered data (`docs/product/audit.md` §4) — this must never happen again in any future screen.
5. **Complexity is added when evidence justifies it, not preemptively.** See the NOW/NEXT/SCALE distinction in `docs/architecture/overview.md`.

## Current status

See `docs/roadmap/README.md` for the phase-by-phase status tracker. As of 2026-08-19: full audit and roadmap complete, no implementation phase started. Recommended next action: **Phase 1 — Foundation Hardening.**
