# Caching strategy

One rule decides everything here: **cache what is requested repeatedly and
doesn't change, never what decides correctness.** Seats, bookings, booking
state, live trip positions, prices at booking time and search results are
always read live.

Redis is a best-effort cache on the request path: any Redis failure is a
cache miss, never a failed request (`apps/api/src/lib/cache.ts`).

## API (apps/api)

| Data | Where | TTL | Why |
|---|---|---|---|
| Road routes (`getRoute`) | memory (500 entries) → Redis | 10 min memory, 24 h Redis; 60 s for a straight-line fallback | No traffic model is requested, so the same two points give the same road, distance and duration. Concurrent requests for one route share one provider call. Google Routes is billed per call. |
| Route alternatives (publish wizard) | memory → Redis | 10 min | Only reused while a driver moves back and forth in one session. |
| Rider route used for search overlap scoring | same as routes, key rounded to ~100 m | — | A ranking signal only; nearby searches share one cached route. |
| Pricing / operational / recurring-detection config | memory | 60 s / 30 s / 5 min | Read on every search fallback and nearly every booking action. An admin edit clears the operational config on that instance immediately; other instances follow within the TTL. |
| Route-selection tokens | Redis | 15 min, one-shot | Shared state across instances, not a cache. A lost token falls back to the default route. |
| Stop candidates for a route | Redis | 1 h | Keyed by route hash. |
| Towns along a route | Redis | 1 h; empty results not cached | Keyed by route hash. |
| Nominatim search / reverse lookups | Redis | 24 h / 7 days (reverse keyed to ~11 m) | OSM's usage policy requires caching. Only used when no Google key is set. |
| Google Places / Geocoding results | not cached | — | Google's terms don't allow storing that content (place IDs aside). Costs are kept down by the session-token flow and client-side reuse instead. |
| Redis health check | memory | 5 min | A PING every 30 s healthcheck was a large share of a metered Redis plan. |
| API JSON responses | `Cache-Control: no-store` | — | Personal/live data must never sit in a device or proxy HTTP cache; the app's own cache decides reuse. |
| Public uploads (`/uploads/`, S3 `public/`) | HTTP | 1 year, immutable | Random filenames, never rewritten — a new photo is a new URL. |

"Already generated" for a ride's stops is decided from Postgres (a ride's
route never changes after creation), never from a cache marker: a lost
marker used to delete and regenerate every stop on the ride.

## Mobile app (apps/mobile, RTK Query)

- **Live data** (bookings, requests, rides, trips, conversations,
  notifications): refetched when a screen mounts (after 30 s) and when the
  app returns to the foreground.
- **Near-static data** (public profiles, trust summaries, a ride's offered
  stops, towns along a route): reused for 5 minutes and not refetched on
  foreground (`src/state/stableData.ts`); changes made from the app
  invalidate them immediately through their tags.
- **Polling** runs only while its screen is visible and the app is in the
  foreground (`src/hooks/useFocusAwarePolling.ts`). Hidden tabs and covered
  screens no longer poll.
- **Geocoding**: retyping a prefix, re-picking a place or re-locating the
  device reuses the earlier answer (`preferCacheValue`). The device's own
  position is looked up at ~11 m precision (`src/utils/coordinates.ts`)
  while the exact position is kept.
- **Prefetch**: the first 3 search results' ride, driver profile and stops
  are fetched ahead of a tap, so opening a result shows content at once.
