import { describe, it, expect } from 'vitest';
import { buildGoogleMapsDirectionsUrl, MAX_MAPS_WAYPOINTS } from '../googleMapsLink';

const params = (url: string) => new URL(url).searchParams;
const DEPARTURE = { lat: 36.8323, lng: 10.1293 };
const ARRIVAL = { lat: 36.8781, lng: 10.3247 };

describe('buildGoogleMapsDirectionsUrl', () => {
  it('routes from the current location when no origin is given', () => {
    const url = buildGoogleMapsDirectionsUrl({ destination: DEPARTURE });
    expect(url.startsWith('https://www.google.com/maps/dir/?')).toBe(true);
    expect(params(url).get('api')).toBe('1');
    expect(params(url).get('destination')).toBe('36.832300,10.129300');
    expect(params(url).get('travelmode')).toBe('driving');
    expect(params(url).has('origin')).toBe(false);
  });

  it('builds the whole trip with passenger stops as ordered waypoints', () => {
    const url = buildGoogleMapsDirectionsUrl({
      origin: DEPARTURE,
      destination: ARRIVAL,
      waypoints: [{ lat: 36.85, lng: 10.2 }, { lat: 36.86, lng: 10.25 }],
    });
    expect(params(url).get('origin')).toBe('36.832300,10.129300');
    expect(params(url).get('destination')).toBe('36.878100,10.324700');
    expect(params(url).get('waypoints')).toBe('36.850000,10.200000|36.860000,10.250000');
  });

  it('keeps the comma inside each coordinate pair unescaped (Android Maps app reads it literally)', () => {
    const url = buildGoogleMapsDirectionsUrl({ destination: DEPARTURE, travelMode: 'walking' });
    expect(url).toContain('destination=36.832300,10.129300');
    expect(url).not.toContain('%2C');
  });

  it('uses walking directions for a passenger heading to the meeting point', () => {
    const url = buildGoogleMapsDirectionsUrl({ destination: DEPARTURE, travelMode: 'walking' });
    expect(params(url).get('travelmode')).toBe('walking');
  });

  it('caps waypoints at the Google Maps limit', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ lat: 36 + i / 100, lng: 10 }));
    const url = buildGoogleMapsDirectionsUrl({ origin: DEPARTURE, destination: ARRIVAL, waypoints: many });
    expect(params(url).get('waypoints')!.split('|')).toHaveLength(MAX_MAPS_WAYPOINTS);
  });
});
