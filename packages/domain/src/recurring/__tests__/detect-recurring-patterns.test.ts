import { describe, it, expect } from 'vitest';
import { detectRecurringPatterns } from '../detect-recurring-patterns';
import { DEFAULT_RECURRING_DETECTION_CONFIG } from '../default-recurring-detection-config';
import type { TripHistoryRecord } from '../trip-history.types';

const config = DEFAULT_RECURRING_DETECTION_CONFIG;

// El Menzah 5 -> Tunis Digital Center, the codebase's own seeded corridor
// (apps/api/src/db/seed.ts) — reused here purely for realistic coordinates.
const ORIGIN = { label: 'El Menzah 5', lat: 36.8508, lng: 10.1658 };
const DESTINATION = { label: 'Tunis Digital Center', lat: 36.8383, lng: 10.1518 };

function tripAt(daysAgo: number, hour: number, minute: number): TripHistoryRecord {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return {
    originLabel: ORIGIN.label,
    originLat: ORIGIN.lat,
    originLng: ORIGIN.lng,
    destinationLabel: DESTINATION.label,
    destinationLat: DESTINATION.lat,
    destinationLng: DESTINATION.lng,
    departureAt: d,
  };
}

// A different, distant corridor, one trip each — never repeated.
function scatterTrip(i: number): TripHistoryRecord {
  const d = new Date();
  d.setDate(d.getDate() - i * 7);
  d.setHours(9 + i, 0, 0, 0);
  return {
    originLabel: `Origin ${i}`,
    originLat: 34 + i,
    originLng: 9 + i,
    destinationLabel: `Destination ${i}`,
    destinationLat: 35 + i,
    destinationLng: 11 + i,
    departureAt: d,
  };
}

describe('detectRecurringPatterns', () => {
  it('finds a clear repeat pattern: same corridor, tight time window, well above minTripCount', () => {
    const history: TripHistoryRecord[] = [
      tripAt(1, 8, 0),
      tripAt(2, 8, 5),
      tripAt(3, 8, 0),
      tripAt(4, 8, 10),
      tripAt(5, 7, 55),
      tripAt(8, 8, 0),
    ];

    const result = detectRecurringPatterns(history, config);

    expect(result).toHaveLength(1);
    const pattern = result[0]!;
    expect(pattern.tripCount).toBe(6);
    expect(pattern.originLabel).toBe(ORIGIN.label);
    expect(pattern.destinationLabel).toBe(DESTINATION.label);
    // Tight time window (max 15 min spread) + trip count at/above
    // fullConfidenceTripCount -> high confidence, comfortably above the
    // default suggestedConfidenceThreshold (0.6).
    expect(pattern.confidenceScore).toBeGreaterThanOrEqual(0.6);
    expect(pattern.confidenceScore).toBeLessThanOrEqual(1);
  });

  it('finds no pattern when every trip is on a different, unrepeated corridor', () => {
    const history: TripHistoryRecord[] = [
      scatterTrip(0),
      scatterTrip(1),
      scatterTrip(2),
      scatterTrip(3),
    ];

    const result = detectRecurringPatterns(history, config);
    expect(result).toHaveLength(0);
  });

  it('produces a borderline-confidence detected (not necessarily suggested-worthy) pattern at exactly minTripCount with a wide time spread', () => {
    // Exactly the minimum trip count, but departure times spread across
    // nearly the full configured time window -> weak time-consistency
    // signal on top of a merely-adequate trip-count signal.
    const history: TripHistoryRecord[] = [tripAt(1, 7, 30), tripAt(8, 8, 0), tripAt(15, 8, 15)];

    const result = detectRecurringPatterns(history, config);

    expect(result).toHaveLength(1);
    const pattern = result[0]!;
    expect(pattern.tripCount).toBe(config.minTripCount);
    // tripCountFactor = 3/6 = 0.5, timeConsistencyFactor = 1 - 45/60 = 0.25
    // -> confidenceScore = 0.5*0.6 + 0.25*0.4 = 0.4, below the 0.6 cutoff.
    expect(pattern.confidenceScore).toBeCloseTo(0.4, 2);
    expect(pattern.confidenceScore).toBeLessThan(config.suggestedConfidenceThreshold);
  });

  it('drops clusters below minTripCount entirely, even when a corridor is genuinely shared', () => {
    const history: TripHistoryRecord[] = [tripAt(1, 8, 0), tripAt(2, 8, 0)];
    const result = detectRecurringPatterns(history, config);
    expect(result).toHaveLength(0);
  });

  it('records which days of the week the cluster actually occurred on', () => {
    // Build trips on two known, fixed calendar dates (not "N days ago") so
    // the expected weekday bits are deterministic regardless of today.
    const monday = new Date('2026-08-17T08:00:00'); // a Monday
    const wednesday = new Date('2026-08-19T08:05:00'); // a Wednesday
    const friday = new Date('2026-08-21T07:55:00'); // a Friday
    const history: TripHistoryRecord[] = [monday, wednesday, friday].map((d) => ({
      originLabel: ORIGIN.label,
      originLat: ORIGIN.lat,
      originLng: ORIGIN.lng,
      destinationLabel: DESTINATION.label,
      destinationLat: DESTINATION.lat,
      destinationLng: DESTINATION.lng,
      departureAt: d,
    }));

    const result = detectRecurringPatterns(history, config);
    expect(result).toHaveLength(1);
    // Monday = bit 0, Wednesday = bit 2, Friday = bit 4.
    expect(result[0]!.daysOfWeekMask).toBe(0b0010101);
  });
});
