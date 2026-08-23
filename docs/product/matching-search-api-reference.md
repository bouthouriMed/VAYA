# Matching Search API — Reference & Example Queries

**Endpoint:** `GET /api/v1/matching/search`
**Purpose:** find rides for a rider given an origin, a destination, and a desired date/time.
**Base URL (local dev):** `http://localhost:3000` or `http://192.168.1.122:3000` (LAN, matches mobile `.env`'s `API_BASE_URL`)

This mirrors the exact contract in `packages/validation/src/matching.ts` (`matchingSearchSchema`) and `apps/api/src/modules/matching/matching.service.ts` — verified live against real seeded data + real Postgres/PostGIS/OSRM/Google APIs on 2026-08-23.

---

## 1. Required query parameters

| Param | Type | Constraint | Meaning |
|---|---|---|---|
| `originLat` | number | -90 to 90 | Rider's pickup latitude |
| `originLng` | number | -180 to 180 | Rider's pickup longitude |
| `destinationLat` | number | -90 to 90 | Rider's dropoff latitude |
| `destinationLng` | number | -180 to 180 | Rider's dropoff longitude |
| `when` | ISO date string | any parseable date | Desired departure time |

All five are **required** — there is no optional/partial search (e.g. no "just search by date" or "just by origin"). All are coerced from query-string strings by Zod (`z.coerce.number()` / `z.coerce.date()`), so plain numbers and ISO datetime strings work directly in a URL.

**Generic shape:**
```
GET /api/v1/matching/search?originLat={lat}&originLng={lng}&destinationLat={lat}&destinationLng={lng}&when={ISO8601}
```

There is no separate "search by date only" or "browse all rides" endpoint — every search is an origin→destination→time query. To find *any* upcoming ride on a route regardless of exact time, pass a `when` far outside the near-term windows (see the `closest_departure` tier below) — the server will return the nearest real departure instead of nothing.

---

## 2. What comes back

```jsonc
{
  "tier": "exact" | "wide_corridor" | "route_passthrough" | "detour_match" | "closest_departure" | "none",
  "candidates": [ /* MatchCandidate[] */ ],
  "message": string | null   // a human-readable French explanation, only set for some tiers
}
```

Each `MatchCandidate` includes `rideId`, driver info, `departureAt`, `seatsAvailable`, `contributionPerSeat`, a `score`, `reasons` (French strings shown in the UI), `matchType`, and — only for the detour tier — a `detour` object (`extraDurationSeconds`, `extraDistanceMeters`, `detourRatio`, `pickupEtaSeconds`, `dropoffEtaSeconds`).

---

## 3. The tier cascade

The server tries tiers in this order and returns the **first one that finds anything** — it does not merge results across tiers.

| Order | Tier | What it means | Trigger radius / window |
|---|---|---|---|
| 1 | `exact` | A ride whose own origin/destination are close to yours, departing near your requested time | pickup ≤ 2000m, dropoff ≤ 3000m, time ± 90 min |
| 2 | `wide_corridor` | Same as exact but with a wider net | pickup ≤ 8000m, dropoff ≤ 10000m, time ± 240 min |
| 3 | `route_passthrough` | A ride whose real road route passes directly through your two points (mid-route pickup/dropoff via the driver's own selected stops) | within 150m of the ride's real route polyline, correct direction |
| 4 | `detour_match` | No ride is already close enough, but a driver's route + your two points is a small enough detour to be worth computing | within 2500m of the ride's route (PostGIS pre-filter), then a real routing-engine call; detour capped at 3–12 min (25% of trip duration) |
| 5 | `closest_departure` | Nothing near your requested time on this corridor — here's the nearest upcoming departure instead | same corridor as `exact`/`wide_corridor`, any time within the next 14 days |
| 6 | `none` | Nothing found by any tier | — |

**Important:** `detour_match` candidates are never directly bookable at a specific stop — they surface a real possibility, not a confirmed pickup. `route_passthrough` only ever returns rides that already have driver-selected stops near both of your points.

---

## 4. Ready-to-run example queries (live-verified 2026-08-23 against real seeded data)

Replace `localhost:3000` with your LAN IP if testing from a phone. Times are in the seed's near-future window — if you're reading this later, re-check with a fresh `pnpm db:seed` or adjust dates.

### `exact` — La Marsa → Tunis Centre Ville, right on time
```
GET /api/v1/matching/search?originLat=36.8785&originLng=10.3247&destinationLat=36.7992&destinationLng=10.1811&when=2026-08-23T19:39:31.882Z
```
Returns the real seeded La Marsa→Tunis ride, `score: 1`.

### `wide_corridor` — Ariana → Le Bardo, ~5km off the ride's own endpoints
```
GET /api/v1/matching/search?originLat=36.9075&originLng=10.1956&destinationLat=36.8542&destinationLng=10.1367&when=2026-08-23T20:39:31.882Z
```
Offset is inside the 8km/10km wide radius but outside the 2km/3km tight one.

### `route_passthrough` — a sub-trip fully inside a long Tunis→Nabeul ride's real route
```
GET /api/v1/matching/search?originLat=36.754756&originLng=10.202238&destinationLat=36.679384&destinationLng=10.32317&when=2026-08-26T06:00:00.000Z
```
Origin/destination are two of the ride's real driver-selected `route_stops` — this only works because the ride has real stops generated from a real OSRM/Google route.

### `detour_match` — ~400-700m off the same Tunis→Nabeul route, near a regional (non-motorway) road
```
GET /api/v1/matching/search?originLat=36.561495&originLng=10.572124&destinationLat=36.529455&destinationLng=10.638046&when=2026-08-26T06:00:00.000Z
```
Returns `matchType: "detour"` with a real computed `detour.extraDurationSeconds` (verified: 285s ≈ "+5 min de détour").
**Note:** points too close to a *motorway* segment of a route tend to fail this tier — a small straight-line offset from a highway can cost 10+ real minutes to detour to/from via the nearest interchange, easily exceeding the 12-minute cap. Regional/local roads produce much cheaper, more realistic detours.

### `closest_departure` — same Ariana/Le Bardo endpoints, but searched for a time far outside any near-term window
```
GET /api/v1/matching/search?originLat=36.8625&originLng=10.1956&destinationLat=36.8092&destinationLng=10.1367&when=2026-08-30T09:00:00.000Z
```
Returns the nearest real upcoming departure on that corridor instead of nothing.

### `none` — a point with nothing anywhere nearby (southern Tunisian desert)
```
GET /api/v1/matching/search?originLat=24.0&originLng=9.0&destinationLat=24.05&destinationLng=9.05&when=2026-08-26T06:00:00.000Z
```
Returns `{"tier":"none","candidates":[],"message":null}`.

---

## 5. Other real seeded corridors worth trying

From the live seed data (query `SELECT origin_label, origin_lat, origin_lng, destination_label, destination_lat, destination_lng, departure_at FROM rides WHERE status='published' AND seats_available > 0 AND departure_at > now() ORDER BY departure_at;` against the dev Postgres to get a fresh, current list):

| Origin | Destination | Notes |
|---|---|---|
| La Marsa (36.8785, 10.3247) | Tunis Centre Ville (36.7992, 10.1811) | short urban hop, multiple departures |
| Ariana (36.8625, 10.1956) | Le Bardo (36.8092, 10.1367) | short urban hop |
| Sousse (35.8256, 10.6369) | Monastir (35.7643, 10.8113) | coastal, short intercity |
| Ben Arous (36.7531, 10.2189) | Tunis (36.8065, 10.1815) | suburb commute |
| Tunis (36.8065, 10.1815) | Nabeul (36.4561, 10.7376) | long intercity, has real driver-selected stops — the one to use for `route_passthrough`/`detour_match` |

---

## 6. Related, non-search endpoints (for context, not part of this search API)

- `GET /api/v1/geocoding/autocomplete?input=&sessionToken=` — turn free text into a location (feed the result into `originLat`/`originLng` etc.)
- `GET /api/v1/geocoding/place-details?placeId=&sessionToken=` — resolve a selected autocomplete prediction to real lat/lng
- `POST /api/v1/matching/notify-me` — "notify me" demand signal for when nothing matched (`notifyMeSchema`: `origin`, `destination`, `desiredWindowStart`, `desiredWindowEnd`)

These are the two-step flow the mobile app's `search/composer.tsx` actually uses before ever calling `/matching/search` — you don't need coordinates memorized if you'd rather search by place name first.
