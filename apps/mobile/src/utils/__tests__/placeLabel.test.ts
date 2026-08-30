import { describe, it, expect } from 'vitest';
import { shortenPlaceLabel } from '../placeLabel';

describe('shortenPlaceLabel', () => {
  it('drops the street name, postal code, and country from a full 4-segment address', () => {
    expect(shortenPlaceLabel('Mas de Born, 43512 Benifallet, Tarragona, Spain')).toBe(
      'Benifallet, Tarragona',
    );
  });

  it('drops the postal-code prefix and country from a 3-segment address', () => {
    expect(shortenPlaceLabel('22860 Borau, Huesca, Spain')).toBe('Borau, Huesca');
  });

  it('drops the country from a simple 2-segment "City, Country" label', () => {
    expect(shortenPlaceLabel('Madrid, Spain')).toBe('Madrid');
  });

  it('leaves a single-segment label (no commas at all) unchanged', () => {
    expect(shortenPlaceLabel('Barcelona')).toBe('Barcelona');
  });

  it('never returns an empty string for a real label', () => {
    expect(shortenPlaceLabel('Tunis, Tunisia')).not.toBe('');
  });
});
