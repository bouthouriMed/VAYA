import { z } from 'zod';

// --- Vaya-owned location domain model ---------------------------------
// Google (Places API New) and the Nominatim fallback are both external
// providers, isolated behind apps/api/src/modules/geocoding/providers/ — no
// call site outside that folder should ever see a raw Google/Nominatim
// response shape. Every provider normalizes into these types instead
// (Location Architecture Spec, docs/domain/location-architecture-spec-
// 2026-08-23.md §4 — this is the pragmatic v1 slice of that larger design:
// a type taxonomy + normalized point, without yet building the full
// cross-language canonical-entity cache that spec's later sections cover).

export const locationTypeEnum = [
  'country',
  'governorate',
  'city',
  'neighborhood',
  'poi',
  'address',
  'unknown',
] as const;
export const locationTypeSchema = z.enum(locationTypeEnum);
export type LocationType = z.infer<typeof locationTypeSchema>;

export const locationPointSchema = z.object({
  /** Provider-issued place identifier (Google `placeId`, or a synthetic
   *  `nominatim:<lat>:<lng>` id for the fallback provider — see
   *  providers/nominatim.provider.ts). Opaque to every consumer; never
   *  parsed for meaning outside the provider that issued it. */
  placeId: z.string().nullable(),
  label: z.string(),
  /** The shorter, human-scannable half of the label (e.g. "Sousse") —
   *  distinct from `label`'s full formatted address, so the UI can show a
   *  bold primary line + a muted secondary line instead of one long string
   *  (this is what fixes the "Sousse / Ville · Sousse Governorate / Sousse
   *  / Gouvernorat" duplicated-noise problem named directly in the brief). */
  primaryText: z.string(),
  secondaryText: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  type: locationTypeSchema,
  formattedAddress: z.string().nullable(),
  city: z.string().nullable(),
  governorate: z.string().nullable(),
  countryCode: z.string().nullable(),
  /** Which provider actually resolved this — never displayed to the user,
   *  kept for observability/debugging (which provider is live in prod). */
  source: z.enum(['google', 'nominatim', 'device', 'manual']),
});
export type LocationPoint = z.infer<typeof locationPointSchema>;

/** A single autocomplete prediction — deliberately NOT a full LocationPoint.
 *  Places API (New) never returns coordinates from Autocomplete itself (by
 *  design — coordinates only come from Place Details); the Nominatim
 *  fallback provider synthesizes this same shape from its one-call /search
 *  response so mobile's autocomplete list never needs to branch on provider.
 *  Only a Place Details call (`resolveLocation`) yields real lat/lng. */
export const locationPredictionSchema = z.object({
  placeId: z.string(),
  primaryText: z.string(),
  secondaryText: z.string().nullable(),
  type: locationTypeSchema,
});
export type LocationPrediction = z.infer<typeof locationPredictionSchema>;

export const autocompleteQuerySchema = z.object({
  input: z.string().min(2).max(200),
  /** Client-generated UUID, stable for one autocomplete interaction (typing
   *  → selecting), per Places API (New)'s session-token billing model
   *  (Autocomplete + the one Place Details call it leads to are billed as a
   *  single session instead of N+1 separate calls). A fresh UUID must be
   *  generated for each new, unrelated search — never reused across them. */
  sessionToken: z.string().uuid(),
});
export type AutocompleteQuery = z.infer<typeof autocompleteQuerySchema>;

export const placeDetailsQuerySchema = z.object({
  placeId: z.string().min(1),
  /** The SAME sessionToken the autocomplete call(s) leading to this
   *  selection used — required for the session-billing discount to apply,
   *  and the mechanism that lets the server tell a real Google session
   *  apart from a stray/replayed placeId. A fresh token is generated
   *  client-side for the next, unrelated search. */
  sessionToken: z.string().uuid(),
});
export type PlaceDetailsQuery = z.infer<typeof placeDetailsQuerySchema>;

// --- Legacy geocoding (still used by reverse-geocoding call sites —
// stop-candidates.service.ts's driver-facing stop labeling — which has no
// autocomplete/session concept at all, just "what's the name of this exact
// point") -------------------------------------------------------------
export const geocodeSearchSchema = z.object({
  q: z.string().min(2).max(200),
});
export type GeocodeSearchInput = z.infer<typeof geocodeSearchSchema>;

export const geocodeReverseSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export type GeocodeReverseInput = z.infer<typeof geocodeReverseSchema>;

export const geocodeResultSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
});
export type GeocodeResult = z.infer<typeof geocodeResultSchema>;
