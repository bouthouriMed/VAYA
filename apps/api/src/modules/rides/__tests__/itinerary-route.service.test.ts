import { describe, it, expect } from 'vitest';
import { orderItineraryWaypoints } from '../itinerary-route.service.js';

// Cité Tahrir -> La Marsa, with Menzah 6 and Lac 2 along the way.
const CITE_TAHRIR = { lat: 36.826, lng: 10.14 };
const MENZAH_6 = { lat: 36.848, lng: 10.172 };
const LAC_2 = { lat: 36.851, lng: 10.272 };
const LA_MARSA = { lat: 36.878, lng: 10.324 };
const ROUTE = [CITE_TAHRIR, MENZAH_6, LAC_2, LA_MARSA];

describe('orderItineraryWaypoints', () => {
  it("puts a passenger's pickup and dropoff on the driver's itinerary, in travel order", () => {
    const waypoints = orderItineraryWaypoints(CITE_TAHRIR, LA_MARSA, ROUTE, [{ pickup: MENZAH_6, dropoff: LAC_2 }]);
    expect(waypoints).toEqual([MENZAH_6, LAC_2]);
  });

  it('interleaves several passengers by their position along the route', () => {
    const earlyPickup = { lat: 36.84, lng: 10.16 };
    const lateDropoff = { lat: 36.865, lng: 10.3 };
    const waypoints = orderItineraryWaypoints(CITE_TAHRIR, LA_MARSA, ROUTE, [
      { pickup: MENZAH_6, dropoff: lateDropoff },
      { pickup: earlyPickup, dropoff: LAC_2 },
    ]);
    expect(waypoints).toEqual([earlyPickup, MENZAH_6, LAC_2, lateDropoff]);
  });

  it("skips points at the ride's own origin/destination and duplicates of an earlier waypoint", () => {
    const waypoints = orderItineraryWaypoints(CITE_TAHRIR, LA_MARSA, ROUTE, [
      { pickup: CITE_TAHRIR, dropoff: LAC_2 },
      { pickup: { lat: MENZAH_6.lat + 0.0005, lng: MENZAH_6.lng }, dropoff: LA_MARSA },
      { pickup: MENZAH_6, dropoff: { lat: LAC_2.lat + 0.0005, lng: LAC_2.lng } },
    ]);
    expect(waypoints).toHaveLength(2);
  });

  it('orders by the straight origin -> destination line when the ride has no stored route', () => {
    const waypoints = orderItineraryWaypoints(CITE_TAHRIR, LA_MARSA, [], [{ pickup: LAC_2, dropoff: MENZAH_6 }]);
    // Dropoff never precedes its own pickup, even when it projects earlier.
    expect(waypoints).toEqual([LAC_2, MENZAH_6]);
  });

  it('has no waypoints for a driver without off-endpoint passengers', () => {
    expect(orderItineraryWaypoints(CITE_TAHRIR, LA_MARSA, ROUTE, [])).toEqual([]);
  });
});
