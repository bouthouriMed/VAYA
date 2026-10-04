/**
 * A point rounded to 4 decimals (~11 m) for *address lookups* of the
 * device's own position: GPS jitter moves a fix by a few metres each time,
 * which made every lookup a new request (a paid one with Google) for the
 * same street address. Only the lookup is rounded — the position itself is
 * always kept exact.
 */
export function roundForAddressLookup(point: { lat: number; lng: number }): { lat: number; lng: number } {
  return { lat: Math.round(point.lat * 1e4) / 1e4, lng: Math.round(point.lng * 1e4) / 1e4 };
}
