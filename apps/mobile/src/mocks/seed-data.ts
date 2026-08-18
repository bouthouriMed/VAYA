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
}

export const CURRENT_USER = { id: 'u-youssef', fullName: 'Youssef' };

export const DRIVERS: Record<string, MockDriver> = {
  sarra: {
    id: 'd-sarra',
    fullName: 'Sarra Ben Ali',
    ratingAvg: 4.9,
    tripCount: 212,
    reliabilityScore: 0.97,
    punctualityScore: 0.95,
    vehicle: { make: 'Peugeot', model: '208', color: 'Grise', plate: '208 TU 1234' },
    mutualContext: 'Tunis Digital Center',
  },
  amine: {
    id: 'd-amine',
    fullName: 'Amine Bel Haj',
    ratingAvg: 4.85,
    tripCount: 130,
    reliabilityScore: 0.94,
    punctualityScore: 0.93,
    vehicle: { make: 'Peugeot', model: '301', color: 'Noire', plate: '210 TU 3344' },
  },
  mehdi: {
    id: 'd-mehdi',
    fullName: 'Mehdi Gharbi',
    ratingAvg: 4.7,
    tripCount: 88,
    reliabilityScore: 0.9,
    punctualityScore: 0.88,
    vehicle: { make: 'Dacia', model: 'Logan', color: 'Bleue', plate: '99 TU 4455' },
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
export const CONTRIBUTION_DT = 5;
