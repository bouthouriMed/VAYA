import { describe, it, expect } from 'vitest';
import { mapGoogleTypesToLocationType, pickBestGeocodeResult } from '../google-places.provider.js';
import { mapNominatimTypeToLocationType } from '../nominatim.provider.js';

// Pure classification functions — no network, no DB. These are the concrete
// mechanism behind the Location Architecture Spec's "classify, don't guess"
// principle (§5[C]/§6): city vs. governorate vs. POI vs. address must never
// be conflated, and this is the exact logic that keeps them apart. Cases
// below mirror the brief's own worked examples ("Sousse" city vs. "ولاية
// سوسة" governorate) directly.

describe('mapGoogleTypesToLocationType', () => {
  it('classifies a locality as a city', () => {
    expect(mapGoogleTypesToLocationType(['locality', 'political'])).toBe('city');
  });

  it('classifies administrative_area_level_1 as a governorate', () => {
    expect(mapGoogleTypesToLocationType(['administrative_area_level_1', 'political'])).toBe(
      'governorate',
    );
  });

  it('classifies a sublocality as a neighborhood', () => {
    expect(mapGoogleTypesToLocationType(['sublocality', 'sublocality_level_1'])).toBe(
      'neighborhood',
    );
  });

  it('classifies an establishment as a POI', () => {
    expect(mapGoogleTypesToLocationType(['establishment', 'point_of_interest', 'train_station'])).toBe(
      'poi',
    );
  });

  it('classifies a street_address as an address', () => {
    expect(mapGoogleTypesToLocationType(['street_address'])).toBe('address');
  });

  it('classifies a country as a country', () => {
    expect(mapGoogleTypesToLocationType(['country', 'political'])).toBe('country');
  });

  it('falls through to unknown for an unrecognized/empty type set, never guessing', () => {
    expect(mapGoogleTypesToLocationType([])).toBe('unknown');
    expect(mapGoogleTypesToLocationType(undefined)).toBe('unknown');
    expect(mapGoogleTypesToLocationType(['some_future_google_type'])).toBe('unknown');
  });

  it('prioritizes the most specific type when multiple could apply', () => {
    // A real Google response for a named place inside a city carries both
    // 'establishment' and, often, no locality type at all directly — but if
    // it ever carried both establishment and locality, the POI should win
    // (it's the more specific, more useful classification for a carpooling
    // pickup point).
    expect(mapGoogleTypesToLocationType(['establishment', 'point_of_interest', 'locality'])).toBe(
      'poi',
    );
  });
});

describe('pickBestGeocodeResult', () => {
  // The concrete bug this guards: a reverse-geocode for a rooftop point can
  // return a plus_code result ("V528+3RF, Ariana, Tunisia") ahead of a real
  // street_address in Google's results array — picking results[0]
  // unconditionally surfaced the plus code to drivers instead of a
  // human-readable address.
  it('prefers a street_address result even when it sorts after a plus_code', () => {
    const results = [
      { types: ['plus_code'], label: 'V528+3RF, Ariana, Tunisia' },
      { types: ['street_address'], label: 'Avenue Habib Bourguiba, Ariana' },
    ];
    expect(pickBestGeocodeResult(results)?.label).toBe('Avenue Habib Bourguiba, Ariana');
  });

  it('falls back to premise when no street_address is present', () => {
    const results = [
      { types: ['plus_code'], label: 'V528+3RF' },
      { types: ['premise'], label: 'Résidence El Menzah' },
    ];
    expect(pickBestGeocodeResult(results)?.label).toBe('Résidence El Menzah');
  });

  it('falls back to route when neither street_address nor premise is present', () => {
    const results = [
      { types: ['plus_code'], label: 'V528+3RF' },
      { types: ['route'], label: 'Avenue de la Liberté' },
    ];
    expect(pickBestGeocodeResult(results)?.label).toBe('Avenue de la Liberté');
  });

  it('falls back to the first result when none of the preferred types are present', () => {
    const results = [
      { types: ['plus_code'], label: 'V528+3RF' },
      { types: ['administrative_area_level_1'], label: 'Ariana Governorate' },
    ];
    expect(pickBestGeocodeResult(results)?.label).toBe('V528+3RF');
  });

  it('returns undefined for an empty results array', () => {
    expect(pickBestGeocodeResult([])).toBeUndefined();
  });
});

describe('mapNominatimTypeToLocationType', () => {
  it('classifies place/city as a city', () => {
    expect(mapNominatimTypeToLocationType('place', 'city', undefined)).toBe('city');
  });

  it('classifies boundary/administrative WITH a settlement address component as a city', () => {
    // A Nominatim result for the city of Sousse still carries
    // class=boundary,type=administrative at some admin levels — but its
    // address block names the settlement itself, which is what
    // distinguishes it from the governorate.
    expect(
      mapNominatimTypeToLocationType('boundary', 'administrative', {
        state: 'Sousse Governorate',
        city: 'Sousse',
      }),
    ).toBe('city');
  });

  it('classifies boundary/administrative WITHOUT a settlement component as a governorate', () => {
    // The literal "ولاية سوسة" case: a boundary/administrative result whose
    // address block has a state but names no settlement inside it.
    expect(
      mapNominatimTypeToLocationType('boundary', 'administrative', { state: 'Sousse Governorate' }),
    ).toBe('governorate');
  });

  it('classifies place/suburb as a neighborhood', () => {
    expect(mapNominatimTypeToLocationType('place', 'suburb', undefined)).toBe('neighborhood');
  });

  it('classifies railway/amenity/tourism/shop as a POI', () => {
    expect(mapNominatimTypeToLocationType('railway', 'station', undefined)).toBe('poi');
    expect(mapNominatimTypeToLocationType('amenity', 'university', undefined)).toBe('poi');
  });

  it('classifies highway/building as an address', () => {
    expect(mapNominatimTypeToLocationType('highway', 'residential', undefined)).toBe('address');
  });

  it('falls through to unknown for an unrecognized class, never guessing', () => {
    expect(mapNominatimTypeToLocationType('natural', 'water', undefined)).toBe('unknown');
    expect(mapNominatimTypeToLocationType(undefined, undefined, undefined)).toBe('unknown');
  });
});
