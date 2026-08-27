import { describe, it, expect } from 'vitest';
import { computeCorridorKey } from '../corridor-key';

describe('computeCorridorKey', () => {
  it('buckets by the leading label segment, lowercased', () => {
    const key = computeCorridorKey(
      { label: 'Tunis, Tunisie' },
      { label: 'Sousse, Gouvernorat de Sousse' },
    );
    expect(key).toBe('tunis__sousse');
  });

  it('is stable regardless of the trailing label detail', () => {
    const a = computeCorridorKey({ label: 'Sfax, Sfax Governorate' }, { label: 'Tunis' });
    const b = computeCorridorKey({ label: 'Sfax' }, { label: 'Tunis, Tunisie' });
    expect(a).toBe(b);
  });

  it('falls back to a coordinate grid cell when no label is present', () => {
    const key = computeCorridorKey(
      { lat: 36.8065, lng: 10.1815 },
      { lat: 35.8256, lng: 10.6369 },
    );
    expect(key).toMatch(/^36\.80,10\.20__35\.85,10\.65$/);
  });

  it('is "unknown" for a point with neither a label nor coordinates', () => {
    expect(computeCorridorKey({}, { label: 'Tunis' })).toBe('unknown__tunis');
  });
});
