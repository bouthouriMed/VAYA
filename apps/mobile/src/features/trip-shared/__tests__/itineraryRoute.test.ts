import { describe, it, expect } from 'vitest';
import { orderAlongStraightLine, resolveItineraryLine } from '../itineraryRoute';

// A real encoded polyline: Cité Tahrir -> Menzah 6 -> Lac 2 -> La Marsa.
function encode(points: { lat: number; lng: number }[]): string {
  const enc = (n: number) => {
    let v = n < 0 ? ~(n << 1) : n << 1;
    let out = '';
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return out + String.fromCharCode(v + 63);
  };
  let prevLat = 0;
  let prevLng = 0;
  return points
    .map((p) => {
      const lat = Math.round(p.lat * 1e5);
      const lng = Math.round(p.lng * 1e5);
      const s = enc(lat - prevLat) + enc(lng - prevLng);
      prevLat = lat;
      prevLng = lng;
      return s;
    })
    .join('');
}

const CITE_TAHRIR = { lat: 36.826, lng: 10.14 };
const MENZAH_6 = { lat: 36.848, lng: 10.172 };
const LAC_2 = { lat: 36.851, lng: 10.272 };
const LA_MARSA = { lat: 36.878, lng: 10.324 };
const toLatLng = (p: { lat: number; lng: number }) => ({ latitude: p.lat, longitude: p.lng });

describe('resolveItineraryLine', () => {
  it("draws the server's road itinerary, which passes through the passengers' points", () => {
    const line = resolveItineraryLine(
      { polyline: encode([CITE_TAHRIR, MENZAH_6, LAC_2, LA_MARSA]), points: [CITE_TAHRIR, MENZAH_6, LAC_2, LA_MARSA], isEstimate: false },
      [],
      [],
    );
    expect(line.isApproximate).toBe(false);
    expect(line.coordinates).toHaveLength(4);
    expect(line.coordinates[1]!.latitude).toBeCloseTo(MENZAH_6.lat, 4);
  });

  it("falls back to the ride's stored road route while the itinerary is loading", () => {
    const stored = [CITE_TAHRIR, LA_MARSA].map(toLatLng);
    expect(resolveItineraryLine(undefined, stored, [])).toEqual({ coordinates: stored, isApproximate: false });
  });

  it('regression: with no road geometry at all, still draws the trip (approximate) instead of two unconnected pins', () => {
    const line = resolveItineraryLine(
      { polyline: null, points: [CITE_TAHRIR, MENZAH_6, LAC_2, LA_MARSA], isEstimate: true },
      [],
      [CITE_TAHRIR, LA_MARSA].map(toLatLng),
    );
    expect(line.isApproximate).toBe(true);
    // Through the passenger's pickup and dropoff, in travel order.
    expect(line.coordinates).toEqual([CITE_TAHRIR, MENZAH_6, LAC_2, LA_MARSA].map(toLatLng));
  });

  it('uses the given fallback points when nothing else is known yet', () => {
    const line = resolveItineraryLine(undefined, [], [MENZAH_6, LAC_2].map(toLatLng));
    expect(line).toEqual({ coordinates: [MENZAH_6, LAC_2].map(toLatLng), isApproximate: true });
  });
});

describe('orderAlongStraightLine', () => {
  it("orders passenger points by where they fall between the driver's origin and destination", () => {
    const ordered = orderAlongStraightLine(toLatLng(CITE_TAHRIR), toLatLng(LA_MARSA), [LAC_2, MENZAH_6].map(toLatLng));
    expect(ordered).toEqual([MENZAH_6, LAC_2].map(toLatLng));
  });
});
