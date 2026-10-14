import { describe, it, expect, vi, afterEach } from 'vitest';
import { GooglePlacesProvider } from '../google-places.provider.js';

// A real Google Geocoding response shape for a point picked on the map in
// Tunis: the best (street_address) result's formatted_address starts with
// a Plus Code and uses Arabic commas. That string is stored verbatim as a
// ride's place label, so the provider must clean it before returning it.
const RESPONSE = {
  status: 'OK',
  results: [
    {
      place_id: 'abc',
      formatted_address: 'R4MF+76P، Rue 6863، Tunis, Tunisia',
      types: ['street_address'],
      geometry: { location: { lat: 36.8323, lng: 10.1293 } },
      address_components: [
        { long_name: 'Tunis', short_name: 'Tunis', types: ['locality'] },
        { long_name: 'Tunisia', short_name: 'TN', types: ['country'] },
      ],
    },
  ],
};

describe('GooglePlacesProvider.reverseGeocode', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('never returns a Plus Code in the stored label', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(RESPONSE), { status: 200 })));

    const point = await new GooglePlacesProvider('test-key').reverseGeocode(36.8323, 10.1293);

    expect(point?.label).toBe('Rue 6863, Tunis, Tunisia');
    expect(point?.primaryText).toBe('Rue 6863, Tunis, Tunisia');
    expect(point?.formattedAddress).toBe('Rue 6863, Tunis, Tunisia');
    expect(point?.city).toBe('Tunis');
  });
});
