/**
 * Static demo data mirroring apps/api/src/db/seed.ts, used to build the UI
 * before it's wired to RTK Query. Replace with real API calls in the next pass.
 */

export interface MockReview {
  raterName: string;
  stars: number;
  comment: string;
  when: string;
}

export interface MockDriver {
  id: string;
  fullName: string;
  ratingAvg: number;
  /** Distinct from tripCount — not every completed trip gets rated. "4.9 from
   *  212 reviews" reads very differently from "5.0 from 2", so this is shown
   *  alongside the average, never replaced by it. */
  ratingsCount: number;
  tripCount: number;
  memberSince: string;
  reliabilityScore: number;
  punctualityScore: number;
  /** How often they accept/respond to a request at all — a stronger day-to-day
   *  trust predictor than the star average, which is why real marketplaces
   *  (Airbnb, BlaBlaCar) surface it prominently. */
  responseRate: number;
  /** Low is good. Shown as-is, never inverted, so a rider can sanity-check it. */
  cancellationRate: number;
  idVerified: boolean;
  phoneVerified: boolean;
  languages: string[];
  /** Ride-comfort signals a rider genuinely filters on (BlaBlaCar-style). */
  preferences: string[];
  badges: string[];
  reviews: MockReview[];
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
    ratingsCount: 29,
    tripCount: 34,
    memberSince: 'Mars 2024',
    reliabilityScore: 0.92,
    punctualityScore: 0.9,
    responseRate: 0.95,
    cancellationRate: 0.03,
    idVerified: true,
    phoneVerified: true,
    languages: ['Français', 'Arabe'],
    preferences: ['Non-fumeur', 'Musique'],
    badges: ['Réponse rapide'],
    reviews: [],
    vehicle: { make: 'Renault', model: 'Clio', color: 'Blanche', plate: '155 TU 5678' },
  },
  sarra: {
    id: 'd-sarra',
    fullName: 'Sarra Ben Ali',
    ratingAvg: 4.9,
    ratingsCount: 198,
    tripCount: 212,
    memberSince: 'Janvier 2023',
    reliabilityScore: 0.97,
    punctualityScore: 0.95,
    responseRate: 0.99,
    cancellationRate: 0.01,
    idVerified: true,
    phoneVerified: true,
    languages: ['Français', 'Arabe', 'Anglais'],
    preferences: ['Non-fumeur', 'Musique douce', 'Animaux acceptés'],
    badges: ['Toujours à l’heure', 'Top conductrice', 'Réponse rapide'],
    reviews: [
      {
        raterName: 'Karim F.',
        stars: 5,
        comment: 'Trajet ponctuel et agréable, conduite très rassurante.',
        when: 'Il y a 3 jours',
      },
      {
        raterName: 'Ines Z.',
        stars: 5,
        comment: 'Sarra prévient toujours à l’avance. Je recommande.',
        when: 'Il y a 1 semaine',
      },
      {
        raterName: 'Ahmed R.',
        stars: 4,
        comment: 'Très bien, juste un petit retard de 5 minutes.',
        when: 'Il y a 2 semaines',
      },
    ],
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
    ratingsCount: 112,
    tripCount: 130,
    memberSince: 'Juin 2023',
    reliabilityScore: 0.94,
    punctualityScore: 0.93,
    responseRate: 0.97,
    cancellationRate: 0.02,
    idVerified: true,
    phoneVerified: true,
    languages: ['Français', 'Arabe'],
    preferences: ['Non-fumeur'],
    badges: ['Toujours à l’heure'],
    reviews: [
      {
        raterName: 'Salma G.',
        stars: 5,
        comment: 'Conduite souple, voiture impeccable.',
        when: 'Il y a 4 jours',
      },
      {
        raterName: 'Fares S.',
        stars: 5,
        comment: 'Ponctuel et courtois, rien à dire.',
        when: 'Il y a 2 semaines',
      },
    ],
    vehicle: { make: 'Peugeot', model: '301', color: 'Noire', plate: '210 TU 3344' },
    priceDt: 5,
    etaMin: 6,
    status: 'En mouvement',
  },
  mehdi: {
    id: 'd-mehdi',
    fullName: 'Mehdi Gharbi',
    ratingAvg: 4.7,
    ratingsCount: 61,
    tripCount: 88,
    memberSince: 'Novembre 2023',
    reliabilityScore: 0.9,
    punctualityScore: 0.88,
    responseRate: 0.91,
    cancellationRate: 0.05,
    idVerified: true,
    phoneVerified: true,
    languages: ['Français', 'Arabe'],
    preferences: ['Musique', 'Animaux acceptés'],
    badges: [],
    reviews: [
      {
        raterName: 'Ola M.',
        stars: 4,
        comment: 'Bon trajet, ambiance sympa.',
        when: 'Il y a 6 jours',
      },
    ],
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

export interface MockPlace {
  id: string;
  label: string;
  subLabel: string;
  lat: number;
  lng: number;
}

/** Real-world-plausible Tunis-area coordinates, used both as search
 *  suggestions and as the "known places" a pickup-point pin can snap to. */
export const PLACES: MockPlace[] = [
  { id: 'p-el-menzah', label: 'El Menzah 5', subLabel: 'Ariana', lat: 36.8508, lng: 10.1658 },
  {
    id: 'p-digital-center',
    label: 'Tunis Digital Center',
    subLabel: 'Lac 2, Tunis',
    lat: 36.8419,
    lng: 10.2413,
  },
  {
    id: 'p-centre-ville',
    label: 'Avenue Habib Bourguiba',
    subLabel: 'Centre-ville, Tunis',
    lat: 36.7992,
    lng: 10.1811,
  },
  { id: 'p-marsa', label: 'La Marsa', subLabel: 'La Marsa, Tunis', lat: 36.8782, lng: 10.3247 },
  {
    id: 'p-lac1',
    label: 'Les Berges du Lac 1',
    subLabel: 'Lac 1, Tunis',
    lat: 36.8324,
    lng: 10.2334,
  },
  { id: 'p-manar', label: 'El Manar', subLabel: 'Tunis', lat: 36.8389, lng: 10.1467 },
  {
    id: 'p-aeroport',
    label: 'Aéroport Tunis-Carthage',
    subLabel: 'Terminal 1',
    lat: 36.851,
    lng: 10.2272,
  },
  { id: 'p-ariana', label: 'Ariana Centre', subLabel: 'Ariana', lat: 36.8625, lng: 10.1956 },
];

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
