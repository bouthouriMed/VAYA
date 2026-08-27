// Missed-demand analytics (CLAUDE.md: "Tunis -> Sousse, Friday 17:00-20:00,
// high search volume, very low supply"). A corridor is bucketed by the
// leading segment of each side's place label (e.g. "Tunis, Tunisie" ->
// "tunis") when one exists — labels are what a human reads on the dashboard
// anyway, so bucketing on them keeps corridor names legible without a
// separate city/governorate lookup table. Falls back to a coarse ~5.5km
// lat/lng grid cell only when no label was captured, so every event still
// buckets into *something* aggregatable rather than being dropped from
// corridor analytics entirely.
const GRID_DEGREES = 0.05;

export interface CorridorPoint {
  label?: string | null;
  lat?: number | null;
  lng?: number | null;
}

function normalizeArea(point: CorridorPoint): string {
  const label = point.label?.trim();
  if (label) {
    const leadingSegment = label.split(',')[0]?.trim().toLowerCase();
    if (leadingSegment) return leadingSegment;
  }
  if (typeof point.lat === 'number' && typeof point.lng === 'number') {
    const roundedLat = Math.round(point.lat / GRID_DEGREES) * GRID_DEGREES;
    const roundedLng = Math.round(point.lng / GRID_DEGREES) * GRID_DEGREES;
    return `${roundedLat.toFixed(2)},${roundedLng.toFixed(2)}`;
  }
  return 'unknown';
}

export function computeCorridorKey(origin: CorridorPoint, destination: CorridorPoint): string {
  return `${normalizeArea(origin)}__${normalizeArea(destination)}`;
}
