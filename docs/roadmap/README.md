# VAYA Implementation Roadmap

This is the status tracker and index for the phased roadmap produced by the 2026-08-19 codebase audit (`docs/product/audit.md`). Each phase is independently understandable and sized to be executable in one Claude Code session — a future session should be able to say **"Implement Phase N"** and act on that phase's file alone, without rediscovering the product from scratch.

## How to use this document

- Read `docs/product/audit.md`, `docs/domain/model.md`, `docs/domain/ride-engine.md`, and `docs/domain/pricing.md` once, at the start of a roadmap session, for the shared context every phase assumes.
- Each phase file (`phase-NN-slug.md`) is self-contained: objective, prerequisites, exact scope, flows, screens, UX behavior, design-system work, frontend/backend/database/API changes, business rules, testing, analytics, Definition of Done, dependencies, risks, complexity.
- Update the status table below as phases complete — this is the single source of truth for "what's done."

## Status

| # | Phase | Horizon | Complexity | Status |
|---|---|---|---|---|
| 1 | [Foundation Hardening](phase-01-foundation-hardening.md) | NOW | Low–Medium | Not started |
| 2 | [Design System: Interaction Layer](phase-02-design-system-interaction-layer.md) | NOW | Medium | Not started |
| 3 | [Real Map Rendering Foundation](phase-03-real-map-rendering.md) | NOW | Medium | Not started |
| 4 | [Ride Engine I: Driver Stops](phase-04-ride-engine-driver-stops.md) | NOW | High | Not started |
| 5 | [Ride Engine II: Passenger Selection](phase-05-ride-engine-passenger-selection.md) | NOW | High | Not started |
| 6 | [Pricing Engine](phase-06-pricing-engine.md) | NOW | Medium | Not started |
| 7 | [Notifications Foundation](phase-07-notifications.md) | NOW/NEXT | Medium | Not started |
| 8 | [Messaging](phase-08-messaging.md) | NEXT | Medium–High | Not started |
| 9 | [Ratings, Reviews & Trust](phase-09-ratings-trust.md) | NEXT | Medium | Not started |
| 10 | [Cancellation & No-Show Policy](phase-10-cancellation-no-show.md) | NEXT | Medium | Not started |
| 11 | [Recurring Rides](phase-11-recurring-rides.md) | NEXT | Medium | Not started |
| 12 | [Scale Hardening](phase-12-scale-hardening.md) | SCALE | High | Not started — trigger-based, see phase file |

**Current phase:** none in progress.
**Recommended next phase:** **Phase 1 — Foundation Hardening.** It fixes real, confirmed bugs (booking overbooking race, missing indexes, fabricated post-booking UI data) with no new product surface, has no prerequisites, and de-risks every phase built on top of it. See the session-summary in root `CLAUDE.md` for the full rationale.

## Sequencing logic

- **Phases 1-3** are foundation/infrastructure: fix what's broken, build the missing interaction-layer primitives, make maps real. Nothing product-shaped ships yet, but everything after depends on this being solid.
- **Phases 4-6** are the two hardest, highest-leverage systems the task brief calls out explicitly: the ride engine (stops) and pricing. These are NOW-horizon because they're the product's core marketplace mechanics, not because they're easy — they're High complexity and should not be rushed.
- **Phase 7** (notifications) sits at the NOW/NEXT boundary: it's needed to make booking events actually felt by users, and several NEXT-phase features (messaging, ratings, recurring rides) depend on its delivery mechanism.
- **Phases 8-11** are NEXT: they round out the marketplace (communication, trust, cancellation, retention) once the core loop (search → match → stop-select → price → book) is solid.
- **Phase 12** is SCALE: explicitly trigger-based, not calendar-based. Do not start it early.

## Known technical debt (carried forward from the audit, not yet phase-assigned beyond what's listed above)

- `apps/mobile/src/mocks/seed-data.ts` usage should shrink to legitimate test fixtures only as Phase 1 and later phases wire real data through; if any screen still imports it for production rendering after Phase 5, that's a regression.
- i18n: no `en` locale exists despite the type system allowing it; central `i18n.ts` wiring wasn't confirmed during the audit — verify early in any phase touching new user-facing copy.
- `tests/e2e` has only a health-check test; Phase 5's Definition of Done adds the first real E2E flow coverage (search→book) — extend E2E coverage opportunistically in every phase touching the core loop rather than batching it into one future "add tests" phase.
- The rider-reputation storage question (flagged in Phase 9) is a genuinely open design decision, not resolved by this roadmap.

## Open decisions (need a human call, not an engineering default)

1. **Product naming**: the app currently renders as "arc." on the landing screen (`apps/mobile/app/index.tsx`) while the codebase, CLAUDE.md, and this roadmap all say "VAYA." Resolve which is the real product name before it propagates further, or confirm "arc." is an intentional sub-brand/wordmark and document why.
2. **`base_rate_per_km`** (Phase 6): requires real Tunisian fuel-price/market input; do not inherit BlaBlaCar's €0.06/km without deliberate adjustment.
3. **Platform fee activation** (Phase 6, `docs/domain/pricing.md`): mechanism will exist, defaulted off. Activating it is a monetization decision for the user to make explicitly.
4. **Cancellation policy consequences without a payment system** (Phase 10): VAYA has no payments yet, so "refund" doesn't apply — needs an explicit reputation-based policy design.
5. **Dark mode**: no dark palette exists in the design system today; not assumed as a requirement — confirm whether it's in scope before any phase builds one.
6. **Messaging moderation/reporting** (Phase 8): flagged as a near-term follow-up risk, not scoped into Phase 8 itself — decide whether it should be pulled into Phase 8 or tracked as its own future phase.

## Blockers

None currently — Phase 1 has no prerequisites and can start immediately.
