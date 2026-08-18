/**
 * Static demo data mirroring apps/api/src/db/seed.ts, used to build the UI
 * before it's wired to RTK Query. Replace with real API calls in the next pass.
 */

export interface MockDriver {
  id: string;
  fullName: string;
  ratingAvg: number;
  tripCount: number;
  reliabilityScore: number;
  punctualityScore: number;
  vehicle: { make: string; model: string; color: string; plate: string };
  mutualContext?: string;
  /** Per-ride, set by the driver — only present when this record represents
   *  an active ride offer (e.g. a cluster candidate), not just a profile. */
  priceDt?: number;
  etaMin?: number;
  status?: string;
}

/**
 * Mirrors apps/api/src/db/seed.ts: Youssef is dual-role (rider primarily,
 * but also has a driver profile), phone/locale match the `users` table shape.
 */
export const CURRENT_USER = {
  id: 'u-youssef',
  fullName: 'Youssef Trabelsi',
  phone: '+216 20 111 002',
  locale: 'fr' as const,
  memberSince: 'Mars 2024',
  phoneVerified: true,
  riderRatingAvg: 4.8,
  riderTripCount: 18,
};

export const DRIVERS: Record<string, MockDriver> = {
  youssef: {
    id: 'd-youssef',
    fullName: 'Youssef Trabelsi',
    ratingAvg: 4.8,
    tripCount: 34,
    reliabilityScore: 0.92,
    punctualityScore: 0.9,
    vehicle: { make: 'Renault', model: 'Clio', color: 'Blanche', plate: '155 TU 5678' },
  },
  sarra: {
    id: 'd-sarra',
    fullName: 'Sarra Ben Ali',
    ratingAvg: 4.9,
    tripCount: 212,
    reliabilityScore: 0.97,
    punctualityScore: 0.95,
    vehicle: { make: 'Peugeot', model: '208', color: 'Grise', plate: '208 TU 1234' },
    mutualContext: 'Tunis Digital Center',
    priceDt: 5,
    etaMin: 3,
    status: 'Se dirige vers vous',
  },
  amine: {
    id: 'd-amine',
    fullName: 'Amine Bel Haj',
    ratingAvg: 4.85,
    tripCount: 130,
    reliabilityScore: 0.94,
    punctualityScore: 0.93,
    vehicle: { make: 'Peugeot', model: '301', color: 'Noire', plate: '210 TU 3344' },
    priceDt: 5,
    etaMin: 6,
    status: 'En mouvement',
  },
  mehdi: {
    id: 'd-mehdi',
    fullName: 'Mehdi Gharbi',
    ratingAvg: 4.7,
    tripCount: 88,
    reliabilityScore: 0.9,
    punctualityScore: 0.88,
    vehicle: { make: 'Dacia', model: 'Logan', color: 'Bleue', plate: '99 TU 4455' },
    priceDt: 4,
    etaMin: 9,
    status: 'Vient de partir',
  },
};

export const HOME_TO_DIGITAL_CENTER = {
  originLabel: 'El Menzah 5',
  destinationLabel: 'Tunis Digital Center',
};

export interface MockCluster {
  id: string;
  label: string;
  driverIds: string[];
  emphasized?: boolean;
}

export const CLUSTERS: MockCluster[] = [
  { id: 'now', label: 'Ready Now', driverIds: ['sarra', 'amine'], emphasized: true },
  { id: '+10', label: '+10 Mins', driverIds: ['mehdi'] },
  { id: '+15', label: '+15 Mins', driverIds: ['amine'] },
  { id: '+25a', label: '+25 Mins', driverIds: ['sarra'] },
  { id: '+25b', label: '+25 Mins', driverIds: ['mehdi'] },
];

export const PICKUP_LABEL = 'Angle Rue de Kairouan';

/** Looks up a driver by mock key, falling back to Sarra if unset/unknown. */
export function getDriverByKey(key?: string | null): MockDriver {
  return (key && DRIVERS[key]) || DRIVERS.sarra!;
}
