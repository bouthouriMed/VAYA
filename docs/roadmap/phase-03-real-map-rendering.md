# Phase 3 — Real Map Rendering Foundation

**Horizon:** NOW · **Estimated complexity:** Medium

## Objective

Replace the design system's placeholder map primitives (`MapCanvas`/`MapPreview`/`MapRoute` — explicitly commented in-source as temporary) and the fake, non-geospatial `search/pickup-point.tsx` canvas with real `react-native-maps` rendering. This is a hard prerequisite for the Ride Engine phases (4/5): you cannot build a real stop-selection UI on a fake map.

## Prerequisites

Phase 2 (Skeleton for map-tile loading states, Icon for map markers/controls).

## Exact scope

1. Build real design-system map primitives backed by `react-native-maps` (`MapView`, `Marker`, `Polyline` — already a mobile dependency):
   - `MapCanvas` → real `MapView` wrapper with VAYA's tile tint (`mapTileTint` token) and default camera/region behavior.
   - `MapRoute` → real `Polyline` using `routePolyline` data (already decoded via existing `decodePolyline` utility), styled with `mapRouteLine`/`mapCorridorFill` tokens.
   - `MapPreview` → a small, non-interactive `MapView` snapshot variant for list/card contexts (e.g. a ride card thumbnail).
   - Keep `DriverMapPin`, `ClusterMarker` (already real, well-built primitives per the design-system audit) — just point them at the new real `MapView` instead of the CSS-art canvas.
2. Migrate consuming screens: `search/cluster.tsx` and driver-onboarding map usage already use real maps per the mobile audit — verify and keep. `driver/publish.tsx`'s route preview and `search/trust.tsx`'s route display should move to the new real primitives if not already.
3. **Do not yet rebuild `pickup-point.tsx`'s interaction model** — that's Phase 4/5's job, since it depends on the candidate-stop system. This phase only ensures the *map rendering itself* is real; it's fine if `pickup-point.tsx` temporarily uses the old fake canvas until Phase 5 replaces the whole screen. Flag this explicitly in the phase so no one assumes Phase 3 alone fixes the fake-pickup-point finding.

## User flows

No new flows. Visual fidelity of existing map-touching screens improves from stylized placeholder to real tiles/geometry.

## Screens

`packages/design-system/src/primitives/MapCanvas.tsx`, `MapPreview.tsx`, `MapRoute.tsx` (rewritten, not new files). Consuming screens: `search/cluster.tsx`, `driver/publish.tsx`, `search/trust.tsx`, driver onboarding vehicle/document screens if they show a map.

## UX behavior

- Map tiles show a skeleton/blur-in while loading (Phase 2's Skeleton), not a blank white rectangle.
- Region-fit behavior (`regionForPoints`, already exists per the mobile audit) continues to work unchanged — this is a rendering swap, not a geometry logic change.

## Design-system work

Primary deliverable of this phase. Update `docs/design-system/README.md`'s Map system row from "REPLACE (planned)" to reflect the new real implementation, including which color tokens the new primitives consume.

## Frontend

`packages/design-system/src/primitives/Map*.tsx`, `apps/mobile/app/search/cluster.tsx`, `apps/mobile/app/driver/publish.tsx`, `apps/mobile/app/search/trust.tsx`, `apps/mobile/package.json` (confirm `react-native-maps` platform config — Android needs a Google Maps API key, iOS uses Apple Maps by default; this is a real setup step, not just a code change, and needs an `.env`/app-config entry).

## Backend

None.

## Database

None.

## API

None.

## Business rules

None new.

## Testing

- Component test confirming the new `MapCanvas`/`MapRoute` render with real `MapView`/`Polyline` given sample coordinates.
- Manual device/simulator verification (per this repo's "test the golden path in a real UI" standard) on both iOS and Android, since `react-native-maps` behaves differently per platform and this can't be fully caught by unit tests.

## Analytics

None new.

## Definition of Done

- [ ] `MapCanvas`, `MapPreview`, `MapRoute` render real tiles/markers/polylines via `react-native-maps`.
- [ ] No screen still renders the CSS-art placeholder except `pickup-point.tsx` (explicitly deferred to Phase 5).
- [ ] Android Google Maps API key is configured (via `app.config` + secret, not committed) and verified working on a real Android build; iOS verified on simulator.
- [ ] `docs/design-system/README.md` updated.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint` pass.

## Dependencies

Hard blocker for Phase 4 (driver stop-selection needs a real map to place candidate stops on) and Phase 5 (passenger stop-selection needs the same).

## Risks

Platform config risk (API keys, native module linking) is the main one — `react-native-maps` setup issues are usually environment/build-config problems, not application logic problems, and can eat time if underestimated. Budget for this explicitly rather than treating it as a pure code-swap.
