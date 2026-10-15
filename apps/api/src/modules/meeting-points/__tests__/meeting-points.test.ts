import { describe, it, expect } from 'vitest';
import { classifyRoadsideFeature, labelRoadsideFeature, routeScanBoxes } from '../meeting-points.service.js';

describe('classifyRoadsideFeature', () => {
  it.each([
    [{ amenity: 'fuel' }, 'fuel_station'],
    [{ amenity: 'bus_station', name: 'Station Louage Moncef Bey' }, 'louage_station'],
    [{ amenity: 'bus_station', name: 'محطة اللواج' }, 'louage_station'],
    [{ amenity: 'bus_station', name: 'Gare routière' }, 'transit_station'],
    [{ railway: 'tram_stop', name: 'Bab Saadoun' }, 'transit_station'],
    [{ highway: 'bus_stop' }, 'bus_stop'],
    [{ junction: 'roundabout' }, 'roundabout'],
    [{ highway: 'motorway_junction', ref: '12' }, 'highway_exit'],
  ])('%o -> %s', (tags, kind) => {
    expect(classifyRoadsideFeature(tags)).toBe(kind);
  });

  it('ignores anything else', () => {
    expect(classifyRoadsideFeature({ amenity: 'cafe' })).toBeNull();
  });
});

describe('labelRoadsideFeature', () => {
  it('uses the French name, the brand of a petrol station, or an exit number', () => {
    expect(labelRoadsideFeature('bus_stop', { name: 'X', 'name:fr': 'Cité Essalama 2' })).toBe('Cité Essalama 2');
    expect(labelRoadsideFeature('fuel_station', { brand: 'Total' })).toBe('Station Total');
    expect(labelRoadsideFeature('highway_exit', { ref: '12' })).toBe('Sortie 12');
    expect(labelRoadsideFeature('roundabout', {})).toBe('Rond-point');
  });
});

describe('routeScanBoxes', () => {
  it('cuts a long route into small padded boxes covering it', () => {
    // ~55 km straight north.
    const route = Array.from({ length: 51 }, (_, i) => ({ lat: 36 + i * 0.01, lng: 10.1 }));
    const boxes = routeScanBoxes(route);
    expect(boxes.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...boxes.map((b) => b.south))).toBeLessThan(36);
    expect(Math.max(...boxes.map((b) => b.north))).toBeGreaterThan(36.5);
    for (const b of boxes) expect(b.west).toBeLessThan(10.1);
  });

  it('gives one box for a short city route', () => {
    expect(routeScanBoxes([{ lat: 36.8, lng: 10.1 }, { lat: 36.81, lng: 10.11 }])).toHaveLength(1);
  });
});
