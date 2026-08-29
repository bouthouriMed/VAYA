/**
 * Reusable personas for the journey-contract suite (docs/tdd_journey_test_matrix.md §5).
 * Pure data + small id/phone generators — no DB/network dependency. Each test
 * that needs real rows still inserts them itself (via whichever real service/
 * schema it's exercising) using these as the canonical display attributes, so
 * every test's "Driver A" / "Passenger B" reads the same way across the suite.
 */

export interface PersonaSeed {
  readonly label: string;
  readonly fullName: string;
}

export const DRIVER_A: PersonaSeed = { label: 'driver-a', fullName: 'Driver A (Madrid-Barcelona corridor)' };

export const PASSENGER_A: PersonaSeed = { label: 'passenger-a', fullName: 'Passenger A (Madrid to Zaragoza)' };
export const PASSENGER_B: PersonaSeed = { label: 'passenger-b', fullName: 'Passenger B (Zaragoza to Barcelona)' };
export const PASSENGER_C: PersonaSeed = { label: 'passenger-c', fullName: 'Passenger C (Zaragoza to Barcelona)' };
export const PASSENGER_D: PersonaSeed = { label: 'passenger-d', fullName: 'Passenger D (Lleida to Barcelona)' };

export const CANONICAL_VEHICLE = {
  make: 'Seat',
  model: 'Leon',
  color: 'Gris',
  seatCount: 3,
} as const;

/**
 * Deterministic-enough-to-read, unique-enough-to-not-collide phone number for
 * a persona within a single test run. Mirrors the `+216<digits>` convention
 * apps/api's own integration tests and tests/e2e already use for throwaway
 * users, swapped to a Spain-shaped prefix since the canonical corridor is
 * Spanish — the API does not validate phone country, only shape.
 */
let phoneCounter = 0;
export function personaPhone(_persona: PersonaSeed): string {
  phoneCounter += 1;
  const base = Date.now() % 100_000_000;
  return `+34${String(base).padStart(8, '0')}${phoneCounter}`.slice(0, 15);
}

export interface PersonaGroup {
  readonly driver: PersonaSeed;
  readonly passengers: readonly PersonaSeed[];
}

export const CANONICAL_PERSONAS: PersonaGroup = {
  driver: DRIVER_A,
  passengers: [PASSENGER_A, PASSENGER_B, PASSENGER_C, PASSENGER_D],
};
