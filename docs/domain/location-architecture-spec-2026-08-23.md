# VAYA Location Architecture Specification

**Date:** 2026-08-23 · **Status:** specification only — no code, no migrations, no implementation in this pass · **Question this document answers:** *How should Vaya resolve arbitrary Arabic/French/English location searches into canonical geographic entities while preserving exact pickup points and city/region semantics?*

**Preface — one honest verification gap.** This spec is grounded in the actual codebase (re-traced directly this session — `apps/api/src/modules/geocoding/geocoding.service.ts`, `apps/mobile/app/search/composer.tsx`, `apps/api/src/db/schema/rides.schema.ts`, `demand-signals.schema.ts`, `bookings.schema.ts`) and in Nominatim's publicly documented, stable API contract (field names like `osm_type`, `osm_id`, `class`, `type`, `addresstype`, `place_rank`, `importance`, `boundingbox`, `address{}`, and the optional `namedetails=1` parameter that returns per-language `name:xx` tags — this is long-standing, versioned public API shape, not this document's invention). **This sandbox could not reach `nominatim.openstreetmap.org` to pull live sample responses for verification** — the outbound proxy returns `403` for that host (confirmed directly: `curl -v` shows `CONNECT tunnel failed, response 403` at the proxy layer, not a DNS/network-down issue). Every claim about Nominatim's *documented* response shape is therefore labeled **DOCUMENTED-API** (a stable, public contract, not verified live this session) rather than **FACT** (verified by reading VAYA's own code) — the distinction matters and is preserved throughout.

---

## 1. Problem, restated precisely (grounded in the prior turn's trace)

**FACT, re-confirmed:** `searchAddress()` (`geocoding.service.ts:22-40`) sends the user's raw query string to Nominatim's `/search`, restricted to a Tunisia bounding box (`bounded=1`), and maps the response through an interface that keeps only `{label: display_name, lat, lng}` (`geocoding.service.ts:16-20,35-39`) — discarding `osm_type`, `osm_id`, `class`, `type`, `importance`, `boundingbox`, and any language-tag information Nominatim's response carries. `apps/mobile/app/search/composer.tsx` — the **single shared component** used by both the passenger search flow (`(tabs)/explore.tsx` → `search/composer.tsx`) and the driver publish flow (`(tabs)/publish.tsx:1069,1092` → `/search/composer`, confirmed by direct grep this session) — lets a user tap one of up to 5 returned rows, each keyed by `${lat},${lng}` (`composer.tsx:75`), and stores exactly that point (`composer.tsx:101-103`). This point becomes `rides.originLat/Lng` (driver) or feeds `GET /matching/search`'s `originLat/originLng` (rider) directly. **`demand_signals.schema.ts` mirrors the identical `label + lat + lng` shape** (no canonical reference, confirmed this session) — the pattern is repeated, not isolated to one table.

**The consequence, precisely stated:** Vaya has exactly one representation for "a place" — a floating-point coordinate pair — used identically whether the human meant a city, a governorate, a train station, or a street address. Two humans who both mean "Sousse" can produce two different floats depending on script, phrasing, or which of Nominatim's ranked results they happened to tap. The matching engine (`matching.service.ts`) then runs fixed-radius geometry (2-3km tight, 8-10km wide — both re-confirmed this session) around whichever float it was given, with no awareness that the float might represent "somewhere in a 2,669 km² administrative region" rather than "a specific urban point."

---

## 2. Design goals and explicit non-goals

**Goals:**
1. The same real-world entity, searched in Arabic, French, or English, must resolve to the same canonical identity — not merely "a nearby point," but the *same entity record*.
2. Genuinely different entities (a city vs. its governorate; a city vs. a named train station inside it) must remain genuinely distinguishable, never silently collapsed into each other.
3. Exact pickup points (`route_stops`, and free-form pickup for legacy stop-less rides) must be **completely unaffected** — this spec adds a layer *upstream* of matching, it does not touch how a specific curb-side stop is represented or selected.
4. The system must degrade honestly when OSM/Nominatim data is incomplete (e.g., no Arabic name tagged for a minor locality) rather than fabricate a translation.

**Explicit non-goals (guardrails against overcorrection, matching the concern raised directly):**
- **Do not make "Sousse" implicitly mean the governorate.** A bare city-name query should resolve to the urban entity a reasonable person means, not the largest administrative polygon that contains it. Nominatim's own `place_rank`/`addresstype`/`class`+`type` classification (DOCUMENTED-API) already ranks a city above its containing governorate for a bare city-name query in the vast majority of cases — this spec leans on that existing signal rather than inventing a new disambiguation heuristic from scratch.
- **Do not build a custom geocoder or replace Nominatim.** This spec adds a *resolution and canonicalization layer* on top of Nominatim's existing results — it does not propose standing up a parallel geocoding index, a custom OSM extract pipeline, or a machine-learned entity-linker. That would be exactly the kind of premature infrastructure CLAUDE.md's architecture principles warn against, and Nominatim already solves the hard part (raw text → candidate places with multilingual tags).
- **Do not force every search into polygon-exact containment.** For a `CITY`-type entity, a widened-radius search around its representative point remains a perfectly reasonable behavior (a city is compact enough that radius-from-center is a fine approximation for candidate generation). Polygon-aware containment logic is genuinely necessary **only** for `GOVERNORATE`-type (and any other large, non-compact administrative area) entities, where a fixed radius from a centroid is geometrically meaningless — see §6.
- **Do not touch `route_stops`, `stop-candidates.service.ts`, or the pickup/dropoff-selection flow.** Those are already correctly point-based (a curb-side stop is inherently a point, not an area) and already OSRM-road-snapped and driver-curated — this spec is entirely about the *search-origin/destination* layer that feeds the matcher's candidate generation, not the pickup-point layer that feeds bookability.

---

## 3. The core distinction this spec is built around

Vaya currently has exactly one location concept. It needs **two**, clearly separated:

| | **Search-area location** (new — this spec) | **Pickup point** (existing — unchanged) |
|---|---|---|
| What it represents | Where a human intends to search from/to — a city, neighborhood, governorate, or POI | Where a vehicle physically stops |
| Inherent shape | An **area** (possibly compact, possibly large) with a representative point | A **point**, always |
| Backing data | `route_stops` (driver-curated, OSRM-road-snapped) — already correct | Same as today, untouched |
| Where it's used | `rides.originLat/Lng`/`destinationLat/Lng` (driver's stated intent), `demand_signals`, the rider's search-origin/destination in `GET /matching/search` | `bookings.pickupStopId/dropoffStopId`, `route_stops.lat/lng` |
| Fix needed | **Yes — this spec** | **No — do not touch** |

This is the single most important architectural clarification: **the bug is not that Vaya uses points at all — points are correct for pickup. The bug is that Vaya uses points for the *search-intent* layer, which is inherently area-shaped, and never distinguishes the two.**

---

## 4. Canonical Location entity model

```ts
// packages/domain/src/location/canonical-location.types.ts  (proposed — not created in this pass)

type LocationType =
  | 'country'
  | 'governorate'      // وilaya — Tunisia's top administrative subdivision
  | 'delegation'        // معتمدية / délégation — Tunisia's second-level subdivision;
                         // collapsed with 'city'/'town' in practice unless a query
                         // is specific enough to need the distinction (see §6)
  | 'city'               // includes town/municipality-scale settlements
  | 'neighborhood'        // a named quarter/district within a larger city
                          //  (e.g. within Greater Tunis)
  | 'poi'                 // a named point of interest — station, landmark, mall
  | 'address';            // a specific street address

interface CanonicalName {
  fr: string | null;
  ar: string | null;
  en: string | null;
  /** The label actually shown when a language-specific name is missing —
   *  never fabricated by translation, always Nominatim's own display_name
   *  or the best available tagged name. */
  fallback: string;
}

interface CanonicalLocation {
  id: string;                       // Vaya-internal UUID
  /** The stable cross-language identity key — see §5. Nominatim's own
   *  (osm_type, osm_id) pair identifies ONE real-world entity regardless
   *  of which language matched the query, which is the entire mechanism
   *  that makes "Sousse" and "سوسة" resolve to the same row. */
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
  type: LocationType;
  name: CanonicalName;
  /** Single representative point — what a CITY/POI/ADDRESS-type entity's
   *  radius-based candidate generation anchors on (§6). For an AREA-type
   *  entity (governorate, and any other large polygon), this is still
   *  populated (Nominatim always returns one) but MUST NOT be used alone
   *  for radius-based matching — see boundingBox/geometry below. */
  center: { lat: number; lng: number };
  /** Present for any entity Nominatim returns a boundingbox for (i.e. most
   *  non-address results) — the coarse rectangular extent. Cheap to store,
   *  cheap to test point-in-box against, and sufficient for GOVERNORATE-
   *  type candidate generation without needing full polygon geometry. */
  boundingBox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null;
  /** Full polygon boundary — deliberately OPTIONAL and NOT required for v1.
   *  Nominatim's `polygon_geojson=1` parameter can return this, but storing
   *  and querying real polygons (point-in-polygon) is meaningfully more
   *  complex than a bounding box and duplicates the PostGIS conversation
   *  v1/v2 of the search-engine audit already scoped as a measured-trigger,
   *  NEXT-horizon decision — not something to bundle into this fix. A
   *  bounding box is a deliberately coarser, cheaper approximation that is
   *  "good enough" for the GOVERNORATE case specifically (see §6's
   *  reasoning for why boundingBox alone, not full geometry, is the right
   *  v1 scope). */
  geometry: null; // reserved field name, intentionally unpopulated in v1
  /** Hierarchy — which governorate a city/delegation belongs to, which
   *  country a governorate belongs to. Populated from Nominatim's
   *  `address{}` breakdown (DOCUMENTED-API: `address.state`/`address.county`
   *  等 fields), not re-derived by Vaya. Nullable at the top (country has no
   *  parent). */
  parentLocationId: string | null;
  country: 'TN'; // Vaya is Tunisia-only today — hardcoded is honest, not lazy
  /** Nominatim's own relevance signal, kept for tie-breaking/ranking
   *  disambiguation candidates — never used to silently auto-pick between
   *  genuinely different entity types (§6). */
  importance: number;
  resolvedAt: Date;
  /** Nominatim data drifts (renames, boundary changes) — a cheap
   *  re-resolution staleness marker, not a sync mechanism (see §9). */
  lastVerifiedAt: Date;
}
```

**Why a bounding box and not full polygon geometry (an explicit, reasoned scope decision, not an oversight):** the entire problem this spec exists to fix is "a governorate-level search anchored on a meaningless single point." A bounding box already fixes that — `matching.service.ts` can test "does this ride's origin fall inside the governorate's bounding rectangle" instead of "is this ride's origin within 8km of one arbitrary centroid point," which is a categorically better test for a large area, at a fraction of the storage/query complexity of real polygon containment. Full polygon geometry is a legitimate future refinement (a governorate's bounding box does include area outside its actual boundary — e.g. a sliver of a neighboring governorate), but it is not necessary to fix the *specific, demonstrated* failure mode (a ride disappearing because two people's "Sousse" points are >8km apart) — and per this codebase's own established discipline (CLAUDE.md's "complexity is added when evidence justifies it, not preemptively"), the bounding box should ship first and be measured before deciding whether the polygon-precision gap is actually costing real matches.

---

## 5. Resolution algorithm — how raw Nominatim results become canonical entities

```
Raw query text (any script/language)
  ↓
Nominatim /search  (existing call, UNCHANGED — same viewbox/bounded params,
                     PLUS: namedetails=1, extratags=0, addressdetails=1 — new
                     params, zero behavior change to the underlying search,
                     just requesting more fields Nominatim already computes)
  ↓
For each raw result:
  ↓
  [A] Identity key = (osm_type, osm_id)  — DOCUMENTED-API: this pair is
      Nominatim's own stable identifier for one real-world OSM entity,
      independent of which language/script matched the query. This is the
      mechanism, not a heuristic: if OSM's Sousse-city relation carries
      both name:fr=Sousse and name:ar=سوسة tags, a query in either language
      that matches THAT relation returns the SAME osm_type+osm_id — Vaya
      does not need to guess string similarity across scripts at all, it
      only needs to key its own canonical-entity cache by this pair.
  ↓
  [B] Has Vaya already resolved this (osm_type, osm_id) before?
        YES → return the existing CanonicalLocation row (cache hit,
              O(1) lookup, no re-classification needed)
        NO  → classify and insert (below), THEN return it
  ↓
  [C] Type classification (new entity only) — DOCUMENTED-API fields:
      Nominatim's `class`+`type` (e.g. class=boundary,type=administrative)
      combined with `addresstype` and `place_rank`/`address.state` /
      `address.county` presence map onto Vaya's LocationType taxonomy:
        - class=boundary, type=administrative, address.state present
          but no finer subdivision in the address chain → GOVERNORATE
        - class=place, type∈{city,town,village} → CITY
        - class=place, type=suburb/neighbourhood → NEIGHBORHOOD
        - class=railway/amenity/tourism/shop (etc.), addresstype≠place
          → POI
        - class=place, type=house/building or a full address match
          → ADDRESS
      This mapping table needs a real pass against actual Tunisia OSM data
      once this sandbox (or a real dev environment) can reach Nominatim —
      flagged explicitly as a P0 verification task for whoever implements
      this, not assumed correct from documentation alone.
  ↓
  [D] Multilingual name population — `namedetails=1` (DOCUMENTED-API)
      returns per-language tags (name:ar, name:fr, name:en when tagged).
      Missing language → CanonicalName field stays null, `fallback` holds
      display_name. NEVER machine-translate a missing name — an absent
      Arabic tag on a minor locality is an honest data gap, not something
      to paper over with a fabricated translation (this mirrors CLAUDE.md's
      "never show fabricated data" principle, applied to place names).
  ↓
  [E] Hierarchy population — `address.state`/`address.county` (DOCUMENTED-
      API, Nominatim's structured address breakdown) resolved to a
      parentLocationId via the SAME resolution process, recursively
      (a governorate is itself resolved and cached exactly like a city —
      no separate mechanism).
  ↓
Canonical Location (cached, reused by every future query that resolves to
the same osm_type+osm_id, in any language)
```

**Why this solves the stated problem, precisely:** two drivers who both mean "Sousse" — one searching "Sousse", one "Sousse, Tunisia" — will, if Nominatim's top result for both is the same OSM relation (the expected, common case), resolve to the **same cached `CanonicalLocation` row**, with the **same stored `center` point** — not two different raw Nominatim floats. This directly closes the "supply exists but search can't find it" liquidity gap described: once both driver and rider searches resolve through this layer, they anchor on one shared representative point (or one shared bounding box, for area-type entities) instead of two independently-computed ones.

---

## 6. Semantic search behavior — city vs. governorate, handled correctly

**The mechanism is classification, not guessing.** Nominatim's own `class`/`type`/`place_rank` fields (DOCUMENTED-API) already rank a bare city-name query's top result as the city itself, not its containing governorate, in the overwhelming majority of cases — Tunisia's OSM data tags the city of Sousse and the Sousse Governorate as two distinct entities with distinct `class`/`type` values, and a plain "Sousse" query's top-ranked result is expected to be the city (higher `importance`/lower `place_rank` for the more "locally specific" match against a bare settlement-name query). §5[C]'s classification step is what makes this explicit and auditable, rather than an implicit accident of API defaults — Vaya's own `LocationType` field on the resolved entity is what `composer.tsx` uses to label the row for the user ("Sousse — Ville" vs. "Sousse — Gouvernorat"), and what `matching.service.ts` uses to pick radius-based vs. bounding-box-based candidate generation (§7).

**"ولاية سوسة" is a structurally different query, and must stay one.** The literal word "ولاية" (governorate/wilaya) is itself a strong signal — Nominatim's own structured matching will favor the `boundary/administrative` entity when the query text contains the administrative-unit word. Vaya's resolver doesn't need special-case string matching for this either: it's the same §5[C] classification applied to whatever Nominatim ranks first, which — because the query text itself disambiguates — is expected to correctly rank the governorate relation above the city.

**When Nominatim's top result is ambiguous or the classification is uncertain (ASSUMPTION, not verified against live data this session):** show, don't guess. `composer.tsx`'s result list already shows up to 5 rows — the fix is to show the **`LocationType` label alongside each**, so "Sousse — Ville" and "Sousse — Gouvernorat" appear as two visibly distinct, individually tappable rows when both are plausible top candidates, rather than one flattened list of bare labels. This is a UI change (disambiguation surfacing), not a resolution-algorithm change — the resolver's job is to classify correctly and preserve the distinction; the UI's job is to never hide a genuine ambiguity behind an auto-pick.

---

## 7. Integration with matching — what changes downstream

**`rides`/`demand_signals` gain an optional reference, not a replacement.** Per CLAUDE.md's schema rule (additive changes only), the existing `originLabel/Lat/Lng` columns are untouched — a new nullable `originLocationId` (and `destinationLocationId`) FK to `canonical_locations` is added alongside. A ride published before this exists (or a search from a client that hasn't adopted the new resolver) keeps working exactly as today, on point-only data — this is the same additive-migration discipline `route_stops`/`pricing_configs`/every other phase in this codebase has already followed.

**Candidate generation, by `LocationType` (this is the part that actually fixes the liquidity problem):**

| Search-origin `LocationType` | Candidate test today | Candidate test proposed |
|---|---|---|
| `city` / `neighborhood` / `poi` / `address` | Point-radius (`TIGHT_PICKUP_RADIUS_M`/`WIDE_PICKUP_RADIUS_M`) around the raw Nominatim float | **Same point-radius mechanism, unchanged** — but anchored on the canonical entity's shared `center`, so two searches resolving to the same city use the identical anchor point instead of two independently-chosen ones. This alone fixes the "driver A's Sousse point vs. driver B's Sousse point vs. passenger's Sousse point" liquidity problem for the common case, with no change to the matcher's actual geometry logic |
| `governorate` (or any other bounding-box-scale entity) | Point-radius around a potentially-meaningless centroid — **the actually-broken case** | **Bounding-box containment test**: does the candidate ride's origin/destination point fall within the governorate's `boundingBox`? This replaces a fixed-radius test with an area-containment test for exactly the entity type where a radius is geometrically wrong — a small, targeted change to `matching.service.ts`'s candidate-generation step (a new branch keyed on the search-input's resolved `LocationType`, not a rewrite of the existing tiers) |

**The existing tier cascade (`exact/wide_corridor/route_passthrough/closest_departure`) is otherwise unchanged.** This is deliberately a minimal, additive integration: the cascade's *logic* stays exactly as audited in the prior two reports; only the *candidate-generation test* at its first stage becomes type-aware instead of always-radius. `route_passthrough`'s polyline-projection mechanism is unaffected either way — it already operates on real route geometry, which this spec doesn't touch.

**A city/POI/address-level search should stay radius-based, not bounding-box, even though a bounding box would technically also work for it** — a compact entity's bounding box is close enough to its radius-circle that switching would add complexity (a second code path) for negligible benefit; the type-branch is worth adding specifically because governorate-scale entities are where a radius is actively wrong, not because bounding-box containment is universally better.

---

## 8. Data model changes (described, not built)

```sql
-- Proposed — NOT created in this pass, per this task's explicit scope.

CREATE TABLE canonical_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_type varchar(10) NOT NULL,     -- 'node' | 'way' | 'relation'
  osm_id bigint NOT NULL,
  type varchar(20) NOT NULL,         -- LocationType
  name_fr varchar(140),
  name_ar varchar(140),
  name_en varchar(140),
  name_fallback varchar(200) NOT NULL,
  center_lat double precision NOT NULL,
  center_lng double precision NOT NULL,
  bbox_min_lat double precision,
  bbox_max_lat double precision,
  bbox_min_lng double precision,
  bbox_max_lng double precision,
  parent_location_id uuid REFERENCES canonical_locations(id),
  country varchar(2) NOT NULL DEFAULT 'TN',
  importance double precision,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (osm_type, osm_id)          -- the identity key from §5[A]
);

-- Additive, nullable, on every table that currently stores a search-area
-- location (NOT route_stops/bookings.pickup*/dropoff* — those are correctly
-- point-based already and are explicitly out of scope, per §2/§3):
ALTER TABLE rides ADD COLUMN origin_location_id uuid REFERENCES canonical_locations(id);
ALTER TABLE rides ADD COLUMN destination_location_id uuid REFERENCES canonical_locations(id);
ALTER TABLE demand_signals ADD COLUMN origin_location_id uuid REFERENCES canonical_locations(id);
ALTER TABLE demand_signals ADD COLUMN destination_location_id uuid REFERENCES canonical_locations(id);
```

`GET /matching/search` gains optional `originLocationId`/`destinationLocationId` query params (alongside, not replacing, the existing `originLat/Lng`) — a client that has resolved through the new layer passes the ID; a client that hasn't (or a raw lat/lng from a map-tap, which should always remain possible — see §12) falls back to the existing point-only path unchanged.

---

## 9. Rollout / backward compatibility

- **Fully additive.** No existing column changes meaning, no existing row becomes invalid, no hard cutover — matching the exact discipline already established for `route_stops`, `pricing_configs`, and every other schema addition in this codebase's history.
- **Lazy resolution, not a bulk backfill.** `canonical_locations` populates on-demand as real searches/publishes hit the new resolver — a bulk backfill of every historical `rides.originLabel` string would require re-querying Nominatim for old data with no guarantee of resolving to the same entity Nominatim would return today (OSM data drifts), and isn't necessary: old rides keep working on their existing point data regardless.
- **Staleness, deliberately not solved by a sync job.** `lastVerifiedAt` exists so a future maintenance pass *could* re-verify an old cached entity against current Nominatim data, but building an active OSM-drift-detection job is explicitly out of this spec's scope — Tunisia's cities/governorates do not rename or re-boundary often enough to justify that infrastructure now (another instance of "complexity added when evidence justifies it").

---

## 10. UX implications for `composer.tsx`

Two changes, both additive to the existing flow (already read directly, `composer.tsx:70-108`):
1. Each result row gains a visible type label (§6) — "Ville" / "Gouvernorat" / "Quartier" / "Lieu" — sourced from the resolved `CanonicalLocation.type`, not guessed client-side.
2. `chooseRow` (`:101-103`) stores the resolved `CanonicalLocation.id` (when resolution succeeded) alongside the existing `{label, lat, lng}` shape — **not instead of it**, so a fallback to raw point data is always available (e.g., resolution service hiccup, or a genuinely un-mappable free-text entry) without the screen needing two different code paths.

**"Ma position actuelle" (current GPS position, `composer.tsx:105-108`) is explicitly unaffected by any of this** — a live device coordinate is not a named place to resolve, it already is an exact point, and should keep behaving exactly as it does today.

---

## 11. Edge cases

| Case | Handling under this spec |
|---|---|
| Same city, Arabic vs. French vs. English query | Resolves to the same `canonical_locations` row via `(osm_type, osm_id)` — §5 |
| City vs. its governorate | Two distinct rows, distinct `type`, distinguished in the UI (§6) — never conflated |
| A named POI inside a city (e.g. a train station) | Classifies as `poi` (§5[C]), stays point-based like `city` in candidate generation (§7's table) — a POI is compact by nature, a radius test is correct for it |
| A neighborhood within Greater Tunis (a real, common Tunisia case — Tunis is an agglomeration of many communes/delegations) | Classifies as `neighborhood` or `city` depending on Nominatim's own tagging for that specific entity — resolved and cached exactly like any other entity, no special-casing needed beyond §5's general mechanism |
| An entity with no Arabic name tagged in OSM | `CanonicalName.ar` stays `null`, `fallback` (Nominatim's `display_name`) is shown instead — never machine-translated (§5[D]) |
| A query matching multiple plausible entities of different types (ambiguous) | Surfaced as separate, type-labeled rows (§6) — the human disambiguates, Vaya never silently picks |
| OSM data renames/re-boundaries a place after Vaya has cached it | `lastVerifiedAt` exists as a hook for a future re-verification pass; not actively solved in v1 (§9) — an acceptable, explicitly-scoped gap given how rarely this actually happens for Tunisia's cities/governorates |
| A user drops a pin on the map instead of typing text (no text query at all) | Out of this spec's resolution path entirely — a raw map-tap point should remain directly usable exactly as today (falls back to point-only, §8's "alongside, not replacing" design) — not every location a user provides has a nameable canonical entity, and that must stay a first-class, un-degraded case |

---

## 12. What NOT to build (guardrails, restated explicitly per the concern raised)

- No custom geocoding engine or OSM extract pipeline — Nominatim stays the source of truth for raw place resolution.
- No forced polygon-exact containment for every search — bounding-box is sufficient for the one case (governorate-scale entities) that actually needs area-awareness; city/POI/address stay radius-based.
- No machine translation of missing language tags.
- No requirement that every location have a canonical entity — a raw map-tap point must remain a fully supported, first-class input.
- No active OSM-drift-monitoring job in v1.
- No change whatsoever to `route_stops`, pickup/dropoff selection, or the OSRM-based ride-engine/stop-generation pipeline audited in the prior two reports — this spec is scoped entirely to the search-intent layer.

---

## 13. Open questions requiring a product decision (not resolved here)

1. **Delegation-level granularity**: does Vaya's product actually need to distinguish a `delegation` (Tunisia's real second-level administrative unit) from `city`, or is collapsing them acceptable for the marketplace's purposes? This spec defaults to collapsing (simpler, and the prompt's own examples don't require the distinction), but it's a real product call, not a technical one.
2. **What happens when a governorate-level search is combined with the existing tight/wide time-window tiers** — should a `GOVERNORATE`-type search skip the `TIGHT_*` tier entirely (since "tight" implies proximity, which is a point-radius concept) and start directly at a bounding-box-equivalent tier? This spec identifies the mechanism (§7's table) but leaves the exact tier-cascade wiring for the implementation task to work out against the existing `matching.service.ts` structure.
3. **Should the driver-publish flow *require* a canonical resolution (reject a raw unresolvable point for a new ride's origin/destination)**, or stay permissive (always allow point-only, same as a rider's raw map-tap)? This spec recommends staying permissive (§12), but a stricter policy is a legitimate alternative a product owner might prefer for data-quality reasons.

---

## Direct answer to the question posed

**Resolve every text search through Nominatim exactly as today, but key the result by Nominatim's own cross-language-stable `(osm_type, osm_id)` identity pair instead of by raw coordinates — cache that identity once as a Vaya-internal `CanonicalLocation` record carrying multilingual names, a `LocationType` classification, a representative point, and (for large/administrative entities only) a bounding box — and let every subsequent search or publish that resolves to the same entity, in any language, share that one cached record instead of independently re-deriving its own point.** Classification comes from Nominatim's own documented `class`/`type`/`address` fields, not from guessing: this is what keeps "Sousse" resolving to the city and "ولاية سوسة" resolving to the governorate as two genuinely different, correctly-typed entities rather than collapsing them. Candidate generation then branches on that type — point-radius (unchanged) for compact entity types, bounding-box containment (new) for large administrative ones — while `route_stops` and the exact-pickup mechanism stay completely untouched, because they were never the broken layer. This is additive to every existing table, requires no hard cutover, and directly closes the liquidity failure mode described: two humans meaning the same city, in different languages or phrasings, now anchor on the same point instead of two independently-chosen ones.
