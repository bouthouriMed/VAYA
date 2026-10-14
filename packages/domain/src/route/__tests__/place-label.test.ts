import { describe, it, expect } from 'vitest';
import { isPlusCode, placeLabelSegments, readablePlaceLabel, shortPlaceLabel } from '../place-label';

// Real labels as stored in production (Google reverse geocoding, Tunisia).
const PLUS_CODE_STREET = 'R4MF+76P، Rue 6863، Tunis, Tunisia';
const NEIGHBOURHOOD = 'Sidi Abdel Aziz, Marsa, Tunisia';

describe('isPlusCode', () => {
  it('recognises short and full Open Location Codes', () => {
    expect(isPlusCode('R4MF+76P')).toBe(true);
    expect(isPlusCode('8FW4V75V+8Q')).toBe(true);
    expect(isPlusCode('V528+3RF')).toBe(true);
  });

  it('does not mistake ordinary address text for one', () => {
    expect(isPlusCode('Rue 6863')).toBe(false);
    expect(isPlusCode('Tunis')).toBe(false);
    expect(isPlusCode('2080')).toBe(false);
  });
});

describe('placeLabelSegments', () => {
  it('splits on Arabic and Latin commas and drops the Plus Code', () => {
    expect(placeLabelSegments(PLUS_CODE_STREET)).toEqual(['Rue 6863', 'Tunis', 'Tunisia']);
  });

  it('drops a Plus Code prefixed to a place name', () => {
    expect(placeLabelSegments('V528+3RF Ariana, Tunisia')).toEqual(['Ariana', 'Tunisia']);
  });
});

describe('readablePlaceLabel', () => {
  it('keeps the full address but never the Plus Code', () => {
    expect(readablePlaceLabel(PLUS_CODE_STREET)).toBe('Rue 6863, Tunis, Tunisia');
    expect(readablePlaceLabel(NEIGHBOURHOOD)).toBe(NEIGHBOURHOOD);
  });

  it('falls back to the original when the label is only a Plus Code', () => {
    expect(readablePlaceLabel('R4MF+76P')).toBe('R4MF+76P');
  });
});

describe('shortPlaceLabel', () => {
  it('turns a Plus-Code street address into a short human title', () => {
    expect(shortPlaceLabel(PLUS_CODE_STREET)).toBe('Rue 6863, Tunis');
    expect(shortPlaceLabel(NEIGHBOURHOOD)).toBe('Sidi Abdel Aziz, Marsa');
  });

  it('keeps the existing behaviour for comma-only labels', () => {
    expect(shortPlaceLabel('Mas de Born, 43512 Benifallet, Tarragona, Spain')).toBe('Benifallet, Tarragona');
    expect(shortPlaceLabel('22860 Borau, Huesca, Spain')).toBe('Borau, Huesca');
    expect(shortPlaceLabel('Madrid, Spain')).toBe('Madrid');
    expect(shortPlaceLabel('Barcelona')).toBe('Barcelona');
  });
});
