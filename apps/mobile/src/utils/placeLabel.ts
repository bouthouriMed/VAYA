/**
 * Shortens a real, full Google-formatted place label (rides.originLabel/
 * destinationLabel — a street-level place name, postal code, locality,
 * admin area, and country, comma-separated) down to just "locality, admin
 * area" for a compact card title — real UX feedback, driven live: a rural
 * address like "Mas de Born, 43512 Benifallet, Tarragona, Spain" made the
 * driver's own trip card title wrap 4 lines, when the postal code and
 * country are already shown in the card's own detail rows below.
 *
 * No structured city/region/country fields exist anywhere in this schema
 * (rides.originLabel is a single flat string — confirmed by reading
 * rides.schema.ts) — this is a best-effort heuristic over the real string
 * (drop the trailing country segment, strip a leading postal-code prefix
 * from each remaining segment, keep the last two), never a fabricated
 * value: every substring shown here is real text that was already in the
 * original label, just a shorter slice of it. Falls back to the original
 * label unchanged whenever the heuristic has nothing meaningful to trim
 * (a single-segment label with no commas at all).
 */
export function shortenPlaceLabel(label: string): string {
  const segments = label
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length <= 1) return label;

  // Drop the trailing segment (Google's formatted-address convention always
  // ends with the country) — segments.length > 1 here, so at least one
  // segment always survives.
  const withoutCountry = segments.slice(0, -1);

  const cleaned = withoutCountry
    .map((s) => s.replace(/^\d[\d\s-]*\s+/, '').trim())
    .filter(Boolean);
  const kept = cleaned.length > 0 ? cleaned : withoutCountry;

  return kept.slice(-2).join(', ');
}
