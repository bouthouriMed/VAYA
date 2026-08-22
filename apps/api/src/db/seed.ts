/* eslint-disable no-console -- CLI seed script; console output is the intended interface */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';
import { getRoute } from '../lib/routing.js';
import {
  computeSuggestedPrice,
  DEFAULT_PRICING_CONFIG,
  DEFAULT_RECURRING_DETECTION_CONFIG,
  type SuggestedPrice,
} from '@vaya/domain';

const {
  users,
  routes,
  driverProfiles,
  vehicles,
  verificationDocuments,
  rides,
  bookings,
  trips,
  ratings,
  recurringPatterns,
  relationshipSignals,
  demandSignals,
  notifications,
  pricingConfigs,
  recurringDetectionConfigs,
} = schema;

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 3_600_000);
}

function daysAgo(d: number): Date {
  return new Date(Date.now() - d * 86_400_000);
}

/** A specific local hour/minute N days from today — used for the "today and
 *  tomorrow" search-flow demo rides below instead of `hoursFromNow`, so
 *  tomorrow's departure times read as real timetable slots (07:30, 13:00,
 *  ...) rather than whatever offset happened to still be "tomorrow" at
 *  whatever time this script was run. */
function atTime(daysFromNow: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log('Seeding VAYA canonical demo dataset...');

  // ── Pricing config (Phase 6, docs/domain/pricing.md) ────────────────
  // Seeded first: every corridor's min/recommended/max below is computed
  // from *this* row via the same @vaya/domain computeSuggestedPrice
  // rides.service.ts calls at real ride-creation time — not hand-typed
  // separately. This is the Phase 6 "backfill" decision documented in
  // docs/roadmap/phase-06-pricing-engine.md's Backend section: derive
  // seeded routes' pricing from the formula rather than keep two sources
  // of truth that can silently drift apart. `baseRatePerKm`'s derivation
  // (first-cut, business-review-pending) is documented in
  // packages/domain/src/pricing/default-pricing-config.ts and
  // docs/domain/pricing.md.
  const [nationalPricingConfig] = await db
    .insert(pricingConfigs)
    .values({
      scope: 'national',
      baseRatePerKm: DEFAULT_PRICING_CONFIG.baseRatePerKm,
      timeComponentPerMin: DEFAULT_PRICING_CONFIG.timeComponentPerMin,
      minMultiplier: DEFAULT_PRICING_CONFIG.minMultiplier,
      maxMultiplier: DEFAULT_PRICING_CONFIG.maxMultiplier,
      platformFeeRate: 0,
      active: true,
    })
    .returning();
  if (!nationalPricingConfig) throw new Error('Failed to insert national pricing config');
  const pricingConfigInput = {
    baseRatePerKm: nationalPricingConfig.baseRatePerKm,
    timeComponentPerMin: nationalPricingConfig.timeComponentPerMin,
    minMultiplier: nationalPricingConfig.minMultiplier,
    maxMultiplier: nationalPricingConfig.maxMultiplier,
  };

  // ── Recurring-pattern detection config (Phase 11, docs/domain/model.md) ──
  // Seeded the same way as the pricing config above: a single active
  // `global`-scope row so the detection job/recurring.service.ts never
  // silently falls back to @vaya/domain's DEFAULT_RECURRING_DETECTION_CONFIG
  // in a seeded environment.
  await db.insert(recurringDetectionConfigs).values({
    scope: 'global',
    minTripCount: DEFAULT_RECURRING_DETECTION_CONFIG.minTripCount,
    fullConfidenceTripCount: DEFAULT_RECURRING_DETECTION_CONFIG.fullConfidenceTripCount,
    lookbackDays: DEFAULT_RECURRING_DETECTION_CONFIG.lookbackDays,
    corridorRadiusMeters: DEFAULT_RECURRING_DETECTION_CONFIG.corridorRadiusMeters,
    timeWindowMinutes: DEFAULT_RECURRING_DETECTION_CONFIG.timeWindowMinutes,
    suggestedConfidenceThreshold: DEFAULT_RECURRING_DETECTION_CONFIG.suggestedConfidenceThreshold,
    dismissalRequiredConfidenceDelta:
      DEFAULT_RECURRING_DETECTION_CONFIG.dismissalRequiredConfidenceDelta,
    active: true,
  });

  // ── Routes (corridors) ─────────────────────────────────────────────
  // Corridor definitions carry only origin/destination — distance/duration
  // (real OSRM, or its haversine fallback) and min/recommended/max
  // contribution are all computed below, not hand-typed, per the "single
  // source of truth" decision above.
  const corridorDefs = [
    {
      key: 'elMenzahDigitalCenter',
      originLabel: 'El Menzah 5',
      originLat: 36.8508,
      originLng: 10.1658,
      destinationLabel: 'Tunis Digital Center',
      destinationLat: 36.8383,
      destinationLng: 10.1518,
    },
    {
      key: 'laMarsaCentreVille',
      originLabel: 'La Marsa',
      originLat: 36.8785,
      originLng: 10.3247,
      destinationLabel: 'Tunis Centre Ville',
      destinationLat: 36.7992,
      destinationLng: 10.1811,
    },
    {
      key: 'arianaLeBardo',
      originLabel: 'Ariana',
      originLat: 36.8625,
      originLng: 10.1956,
      destinationLabel: 'Le Bardo',
      destinationLat: 36.8092,
      destinationLng: 10.1367,
    },
    {
      key: 'benArousTunis',
      originLabel: 'Ben Arous',
      originLat: 36.7531,
      originLng: 10.2189,
      destinationLabel: 'Tunis',
      destinationLat: 36.8065,
      destinationLng: 10.1815,
    },
    {
      key: 'manoubaTunis',
      originLabel: 'Manouba',
      originLat: 36.8081,
      originLng: 10.0972,
      destinationLabel: 'Tunis',
      destinationLat: 36.8065,
      destinationLng: 10.1815,
    },
    {
      key: 'sousseMonastir',
      originLabel: 'Sousse',
      originLat: 35.8256,
      originLng: 10.6369,
      destinationLabel: 'Monastir',
      destinationLat: 35.7643,
      destinationLng: 10.8113,
    },
    {
      key: 'sfaxSakietEzzit',
      originLabel: 'Sfax',
      originLat: 34.7406,
      originLng: 10.7603,
      destinationLabel: 'Sakiet Ezzit',
      destinationLat: 34.7822,
      destinationLng: 10.7397,
    },
    {
      key: 'tunisNabeul',
      originLabel: 'Tunis',
      originLat: 36.8065,
      originLng: 10.1815,
      destinationLabel: 'Nabeul',
      destinationLat: 36.4561,
      destinationLng: 10.7376,
    },
  ] as const;

  interface CorridorGeometry {
    routePolyline: string | null;
    estimatedDurationSec: number;
    distanceKm: number;
    estimatedDurationMin: number;
    pricing: SuggestedPrice;
  }
  const corridorGeometryByKey = new Map<string, CorridorGeometry>();
  for (const c of corridorDefs) {
    const geometry = await getRoute(
      { lat: c.originLat, lng: c.originLng },
      { lat: c.destinationLat, lng: c.destinationLng },
    );
    const distanceKm = geometry.distanceM / 1000;
    const durationMin = geometry.durationSec / 60;
    corridorGeometryByKey.set(c.key, {
      routePolyline: geometry.polyline || null,
      estimatedDurationSec: geometry.durationSec,
      distanceKm,
      estimatedDurationMin: Math.round(durationMin),
      pricing: computeSuggestedPrice(distanceKm, durationMin, pricingConfigInput, {
        isEstimate: geometry.isEstimate,
      }),
    });
  }
  function corridorGeometryFor(key: string): CorridorGeometry {
    const g = corridorGeometryByKey.get(key);
    if (!g) throw new Error(`No precomputed geometry for corridor ${key}`);
    return g;
  }

  const [
    elMenzahDigitalCenter,
    laMarsaCentreVille,
    arianaLeBardo,
    benArousTunis,
    manoubaTunis,
    sousseMonastir,
    sfaxSakietEzzit,
    tunisNabeul,
  ] = await db
    .insert(routes)
    .values(
      corridorDefs.map((c) => {
        const g = corridorGeometryFor(c.key);
        return {
          originLabel: c.originLabel,
          originLat: c.originLat,
          originLng: c.originLng,
          destinationLabel: c.destinationLabel,
          destinationLat: c.destinationLat,
          destinationLng: c.destinationLng,
          distanceKm: g.distanceKm,
          estimatedDurationMin: g.estimatedDurationMin,
          minContribution: g.pricing.min,
          recommendedContribution: g.pricing.recommended,
          maxContribution: g.pricing.max,
        };
      }),
    )
    .returning();

  if (
    !elMenzahDigitalCenter ||
    !laMarsaCentreVille ||
    !arianaLeBardo ||
    !benArousTunis ||
    !manoubaTunis ||
    !sousseMonastir ||
    !sfaxSakietEzzit ||
    !tunisNabeul
  ) {
    throw new Error('Failed to insert routes');
  }

  // ── Users ──────────────────────────────────────────────────────────
  const userSeeds = [
    { fullName: 'Sarra Ben Ali', phone: '+21620111001' },
    { fullName: 'Youssef Trabelsi', phone: '+21620111002' },
    { fullName: 'Mehdi Gharbi', phone: '+21620111003' },
    { fullName: 'Marwa Jendoubi', phone: '+21620111004' },
    { fullName: 'Karim Fassi', phone: '+21620111005' },
    { fullName: 'Rania Chaabane', phone: '+21620111006' },
    { fullName: 'Hedi Sassi', phone: '+21620111007' },
    { fullName: 'Nour Khedher', phone: '+21620111008' },
    { fullName: 'Amine Bel Haj', phone: '+21620111009' },
    { fullName: 'Ines Zouari', phone: '+21620111010' },
    { fullName: 'Ahmed Rezgui', phone: '+21620111011' },
    { fullName: 'Salma Guermazi', phone: '+21620111012' },
    { fullName: 'Bilel Ayari', phone: '+21620111013' },
    { fullName: 'Ola Mejri', phone: '+21620111014' },
    { fullName: 'Fares Sahli', phone: '+21620111015' },
    { fullName: 'Yasmine Chtioui', phone: '+21620111016' },
    { fullName: 'Aymen Hammami', phone: '+21620111017' },
    { fullName: 'Sonia Ferjani', phone: '+21620111018' },
    { fullName: 'Wassim Bouazizi', phone: '+21620111019' },
    { fullName: 'Leila Mansour', phone: '+21620111020' },
  ];
  const insertedUsers = await db.insert(users).values(userSeeds).returning();
  const userByName = (name: string) => {
    const u = insertedUsers.find((row) => row.fullName === name);
    if (!u) throw new Error(`Seed user not found: ${name}`);
    return u;
  };

  // Reuses the geometry/pricing already computed once above (keyed by
  // corridor key) rather than calling OSRM a second time per corridor —
  // just re-keyed by the now-known route.id for the ride inserts below.
  const corridorRoutes = [
    elMenzahDigitalCenter,
    laMarsaCentreVille,
    arianaLeBardo,
    benArousTunis,
    manoubaTunis,
    sousseMonastir,
    sfaxSakietEzzit,
    tunisNabeul,
  ];
  const routeGeometry = new Map<string, CorridorGeometry>();
  corridorDefs.forEach((c, i) => {
    const routeRow = corridorRoutes[i];
    if (!routeRow) throw new Error(`Missing inserted route row for corridor ${c.key}`);
    routeGeometry.set(routeRow.id, corridorGeometryFor(c.key));
  });
  function geometryFor(routeId: string): { routePolyline: string | null; estimatedDurationSec: number } {
    const g = routeGeometry.get(routeId);
    if (!g) throw new Error(`No precomputed geometry for route ${routeId}`);
    return { routePolyline: g.routePolyline, estimatedDurationSec: g.estimatedDurationSec };
  }
  // Phase 6: every seeded ride's contributionPerSeat is its corridor's
  // formula-derived `recommended` value — see the "Pricing config" comment
  // above for why this replaces the old hand-typed per-ride numbers.
  function priceFor(routeId: string): number {
    const g = routeGeometry.get(routeId);
    if (!g) throw new Error(`No precomputed geometry for route ${routeId}`);
    return g.pricing.recommended;
  }

  const sarra = userByName('Sarra Ben Ali');
  const youssef = userByName('Youssef Trabelsi');
  const mehdi = userByName('Mehdi Gharbi');
  const marwa = userByName('Marwa Jendoubi');
  const karim = userByName('Karim Fassi');
  const hedi = userByName('Hedi Sassi');
  const amine = userByName('Amine Bel Haj');
  const ahmed = userByName('Ahmed Rezgui');
  const bilel = userByName('Bilel Ayari');

  // ── Driver profiles + vehicles + documents ────────────────────────
  const driverSeeds = [
    {
      user: sarra,
      ratingAvg: 4.9,
      tripCount: 212,
      punctualityScore: 0.95,
      reliabilityScore: 0.97,
      verificationStatus: 'approved' as const,
      bio: "Plus de 200 trajets réalisés, toujours ponctuelle. J'aime discuter en route mais je respecte aussi le silence si vous préférez.",
      languages: ['Français', 'Arabe', 'Anglais'],
      vehicle: {
        make: 'Peugeot',
        model: '208',
        color: 'Grise',
        plateNumber: '208TU1234',
        seatCount: 3,
      },
    },
    {
      user: youssef,
      ratingAvg: 4.8,
      tripCount: 34,
      punctualityScore: 0.9,
      reliabilityScore: 0.92,
      verificationStatus: 'approved' as const,
      bio: 'Trajets réguliers vers le Grand Tunis. Voiture climatisée, chargeur USB disponible.',
      languages: ['Français', 'Arabe'],
      vehicle: {
        make: 'Renault',
        model: 'Clio',
        color: 'Blanche',
        plateNumber: '155TU5678',
        seatCount: 3,
      },
    },
    {
      user: mehdi,
      ratingAvg: 4.7,
      tripCount: 88,
      punctualityScore: 0.88,
      reliabilityScore: 0.9,
      verificationStatus: 'approved' as const,
      bio: 'Trajets quotidiens vers le centre-ville. Voiture spacieuse, coffre pour bagages.',
      languages: ['Français', 'Arabe'],
      vehicle: {
        make: 'Dacia',
        model: 'Logan',
        color: 'Bleue',
        plateNumber: '99TU4455',
        seatCount: 4,
      },
    },
    {
      user: karim,
      ratingAvg: 4.6,
      tripCount: 61,
      punctualityScore: 0.85,
      reliabilityScore: 0.87,
      verificationStatus: 'approved' as const,
      bio: "Je conduis dans la ville depuis plus de 5 ans. J'aime rencontrer de nouvelles personnes et je m'assure qu'elles arrivent à destination en toute sécurité. Je garde ma voiture propre et j'ai toujours de la musique douce.",
      languages: ['Français', 'Arabe', 'Anglais'],
      vehicle: {
        make: 'Kia',
        model: 'Picanto',
        color: 'Rouge',
        plateNumber: '77TU2211',
        seatCount: 3,
      },
    },
    {
      user: hedi,
      ratingAvg: 4.5,
      tripCount: 45,
      punctualityScore: 0.82,
      reliabilityScore: 0.85,
      verificationStatus: 'approved' as const,
      bio: "Je conduis dans la ville depuis plus de 5 ans. J'aime rencontrer de nouvelles personnes et je garde toujours ma voiture propre.",
      languages: ['Français', 'Arabe', 'Anglais'],
      vehicle: {
        make: 'Volkswagen',
        model: 'Golf',
        color: 'Grise',
        plateNumber: '133TU9090',
        seatCount: 4,
      },
    },
    {
      user: amine,
      ratingAvg: 4.85,
      tripCount: 130,
      punctualityScore: 0.93,
      reliabilityScore: 0.94,
      verificationStatus: 'approved' as const,
      bio: 'Trajets réguliers Tunis-Sousse, toujours à l’heure. Musique douce et climatisation à bord.',
      languages: ['Français', 'Arabe'],
      vehicle: {
        make: 'Peugeot',
        model: '301',
        color: 'Noire',
        plateNumber: '210TU3344',
        seatCount: 4,
      },
    },
    {
      user: ahmed,
      ratingAvg: 4.4,
      tripCount: 22,
      punctualityScore: 0.8,
      reliabilityScore: 0.83,
      verificationStatus: 'approved' as const,
      bio: 'Nouveau sur Vaya mais déjà plusieurs trajets réussis. Ponctuel et discret.',
      languages: ['Arabe', 'Français'],
      vehicle: {
        make: 'Hyundai',
        model: 'i10',
        color: 'Blanche',
        plateNumber: '61TU7788',
        seatCount: 3,
      },
    },
    {
      user: bilel,
      ratingAvg: 0,
      tripCount: 0,
      punctualityScore: 0,
      reliabilityScore: 0,
      verificationStatus: 'pending' as const,
      bio: null,
      languages: null,
      vehicle: {
        make: 'Seat',
        model: 'Ibiza',
        color: 'Grise',
        plateNumber: '188TU6622',
        seatCount: 3,
      },
    },
    {
      user: userByName('Rania Chaabane'),
      ratingAvg: 4.75,
      tripCount: 97,
      punctualityScore: 0.91,
      reliabilityScore: 0.93,
      verificationStatus: 'approved' as const,
      bio: "Conductrice depuis 3 ans, je propose surtout des trajets le matin. J'aime garder une ambiance calme pendant le trajet.",
      languages: ['Français', 'Arabe', 'Anglais'],
      vehicle: {
        make: 'Citroën',
        model: 'C3',
        color: 'Bleue',
        plateNumber: '142TU7701',
        seatCount: 4,
      },
    },
    {
      user: userByName('Leila Mansour'),
      ratingAvg: 4.65,
      tripCount: 53,
      punctualityScore: 0.87,
      reliabilityScore: 0.89,
      verificationStatus: 'approved' as const,
      bio: 'Toujours ponctuelle, voiture climatisée. Je facilite les bagages et je respecte les arrêts convenus.',
      languages: ['Français', 'Arabe'],
      vehicle: {
        make: 'Toyota',
        model: 'Yaris',
        color: 'Blanche',
        plateNumber: '69TU8823',
        seatCount: 4,
      },
    },
  ];

  const driverProfileByUserId = new Map<string, typeof driverProfiles.$inferSelect>();
  const vehicleByUserId = new Map<string, typeof vehicles.$inferSelect>();

  for (const seed of driverSeeds) {
    const [profile] = await db
      .insert(driverProfiles)
      .values({
        userId: seed.user.id,
        verificationStatus: seed.verificationStatus,
        bio: seed.bio ?? null,
        languages: seed.languages ? seed.languages.join(',') : null,
        ratingAvg: seed.ratingAvg,
        tripCount: seed.tripCount,
        punctualityScore: seed.punctualityScore,
        reliabilityScore: seed.reliabilityScore,
        approvedAt: seed.verificationStatus === 'approved' ? daysAgo(200) : null,
      })
      .returning();
    if (!profile) throw new Error('Failed to insert driver profile');
    driverProfileByUserId.set(seed.user.id, profile);

    const [vehicle] = await db
      .insert(vehicles)
      .values({ driverProfileId: profile.id, ...seed.vehicle })
      .returning();
    if (!vehicle) throw new Error('Failed to insert vehicle');
    vehicleByUserId.set(seed.user.id, vehicle);

    const docStatus = seed.verificationStatus === 'pending' ? 'pending' : 'approved';
    await db.insert(verificationDocuments).values([
      {
        driverProfileId: profile.id,
        type: 'license',
        fileUrl: '/uploads/seed-license.jpg',
        status: docStatus,
      },
      {
        driverProfileId: profile.id,
        type: 'registration',
        fileUrl: '/uploads/seed-registration.jpg',
        status: docStatus,
      },
    ]);
  }

  const sarraProfile = driverProfileByUserId.get(sarra.id)!;
  const sarraVehicle = vehicleByUserId.get(sarra.id)!;
  const youssefProfile = driverProfileByUserId.get(youssef.id)!;
  const youssefVehicle = vehicleByUserId.get(youssef.id)!;
  const mehdiProfile = driverProfileByUserId.get(mehdi.id)!;
  const mehdiVehicle = vehicleByUserId.get(mehdi.id)!;
  const karimProfile = driverProfileByUserId.get(karim.id)!;
  const karimVehicle = vehicleByUserId.get(karim.id)!;
  const amineProfile = driverProfileByUserId.get(amine.id)!;
  const amineVehicle = vehicleByUserId.get(amine.id)!;
  const ahmedProfile = driverProfileByUserId.get(ahmed.id)!;
  const ahmedVehicle = vehicleByUserId.get(ahmed.id)!;
  const hediProfile = driverProfileByUserId.get(hedi.id)!;
  const hediVehicle = vehicleByUserId.get(hedi.id)!;
  const raniaProfile = driverProfileByUserId.get(userByName('Rania Chaabane').id)!;
  const raniaVehicle = vehicleByUserId.get(userByName('Rania Chaabane').id)!;
  const leilaProfile = driverProfileByUserId.get(userByName('Leila Mansour').id)!;
  const leilaVehicle = vehicleByUserId.get(userByName('Leila Mansour').id)!;

  // ── Recurring pattern: Youssef's weekday morning commute ──────────
  const [morningCommutePattern] = await db
    .insert(recurringPatterns)
    .values({
      userId: youssef.id,
      role: 'rider',
      routeId: elMenzahDigitalCenter.id,
      originLabel: elMenzahDigitalCenter.originLabel,
      originLat: elMenzahDigitalCenter.originLat,
      originLng: elMenzahDigitalCenter.originLng,
      destinationLabel: elMenzahDigitalCenter.destinationLabel,
      destinationLat: elMenzahDigitalCenter.destinationLat,
      destinationLng: elMenzahDigitalCenter.destinationLng,
      daysOfWeekMask: 0b0011111,
      timeWindowStart: '08:00',
      timeWindowEnd: '08:30',
      confidenceScore: 0.91,
      status: 'enabled',
      lastMatchedAt: hoursFromNow(-20),
    })
    .returning();
  if (!morningCommutePattern) throw new Error('Failed to insert recurring pattern');

  await db.insert(recurringPatterns).values([
    {
      userId: karim.id,
      role: 'rider',
      routeId: laMarsaCentreVille.id,
      originLabel: laMarsaCentreVille.originLabel,
      originLat: laMarsaCentreVille.originLat,
      originLng: laMarsaCentreVille.originLng,
      destinationLabel: laMarsaCentreVille.destinationLabel,
      destinationLat: laMarsaCentreVille.destinationLat,
      destinationLng: laMarsaCentreVille.destinationLng,
      daysOfWeekMask: 0b0011111,
      timeWindowStart: '07:45',
      timeWindowEnd: '08:15',
      confidenceScore: 0.62,
      status: 'detected',
    },
    {
      userId: amine.id,
      role: 'driver',
      routeId: elMenzahDigitalCenter.id,
      originLabel: elMenzahDigitalCenter.originLabel,
      originLat: elMenzahDigitalCenter.originLat,
      originLng: elMenzahDigitalCenter.originLng,
      destinationLabel: elMenzahDigitalCenter.destinationLabel,
      destinationLat: elMenzahDigitalCenter.destinationLat,
      destinationLng: elMenzahDigitalCenter.destinationLng,
      daysOfWeekMask: 0b0011111,
      timeWindowStart: '08:00',
      timeWindowEnd: '08:30',
      confidenceScore: 0.74,
      status: 'suggested',
    },
  ]);

  // ── Rides ──────────────────────────────────────────────────────────
  const [rideInProgress] = await db
    .insert(rides)
    .values({
      driverProfileId: sarraProfile.id,
      vehicleId: sarraVehicle.id,
      routeId: elMenzahDigitalCenter.id,
      originLabel: elMenzahDigitalCenter.originLabel,
      originLat: elMenzahDigitalCenter.originLat,
      originLng: elMenzahDigitalCenter.originLng,
      destinationLabel: elMenzahDigitalCenter.destinationLabel,
      destinationLat: elMenzahDigitalCenter.destinationLat,
      destinationLng: elMenzahDigitalCenter.destinationLng,
      departureAt: hoursFromNow(-0.1),
      seatsTotal: 3,
      seatsAvailable: 1,
      contributionPerSeat: priceFor(elMenzahDigitalCenter.id),
      status: 'in_progress',
      ...geometryFor(elMenzahDigitalCenter.id),
      recurringPatternId: morningCommutePattern.id,
    })
    .returning();
  if (!rideInProgress) throw new Error('Failed to insert in_progress ride');

  const [ridePublished1, ridePublished2, ridePublished3, ridePublished4] = await db
    .insert(rides)
    .values([
      {
        driverProfileId: amineProfile.id,
        vehicleId: amineVehicle.id,
        routeId: elMenzahDigitalCenter.id,
        originLabel: elMenzahDigitalCenter.originLabel,
        originLat: elMenzahDigitalCenter.originLat,
        originLng: elMenzahDigitalCenter.originLng,
        destinationLabel: elMenzahDigitalCenter.destinationLabel,
        destinationLat: elMenzahDigitalCenter.destinationLat,
        destinationLng: elMenzahDigitalCenter.destinationLng,
        departureAt: hoursFromNow(1),
        seatsTotal: 4,
        seatsAvailable: 3,
        contributionPerSeat: priceFor(elMenzahDigitalCenter.id),
        status: 'published',
        ...geometryFor(elMenzahDigitalCenter.id),
      },
      {
        driverProfileId: mehdiProfile.id,
        vehicleId: mehdiVehicle.id,
        routeId: laMarsaCentreVille.id,
        originLabel: laMarsaCentreVille.originLabel,
        originLat: laMarsaCentreVille.originLat,
        originLng: laMarsaCentreVille.originLng,
        destinationLabel: laMarsaCentreVille.destinationLabel,
        destinationLat: laMarsaCentreVille.destinationLat,
        destinationLng: laMarsaCentreVille.destinationLng,
        departureAt: hoursFromNow(2),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: priceFor(laMarsaCentreVille.id),
        status: 'published',
        ...geometryFor(laMarsaCentreVille.id),
      },
      {
        driverProfileId: karimProfile.id,
        vehicleId: karimVehicle.id,
        routeId: arianaLeBardo.id,
        originLabel: arianaLeBardo.originLabel,
        originLat: arianaLeBardo.originLat,
        originLng: arianaLeBardo.originLng,
        destinationLabel: arianaLeBardo.destinationLabel,
        destinationLat: arianaLeBardo.destinationLat,
        destinationLng: arianaLeBardo.destinationLng,
        departureAt: hoursFromNow(3),
        seatsTotal: 3,
        seatsAvailable: 2,
        contributionPerSeat: priceFor(arianaLeBardo.id),
        status: 'published',
        ...geometryFor(arianaLeBardo.id),
      },
      {
        driverProfileId: ahmedProfile.id,
        vehicleId: ahmedVehicle.id,
        routeId: benArousTunis.id,
        originLabel: benArousTunis.originLabel,
        originLat: benArousTunis.originLat,
        originLng: benArousTunis.originLng,
        destinationLabel: benArousTunis.destinationLabel,
        destinationLat: benArousTunis.destinationLat,
        destinationLng: benArousTunis.destinationLng,
        departureAt: hoursFromNow(4),
        seatsTotal: 3,
        seatsAvailable: 0,
        contributionPerSeat: priceFor(benArousTunis.id),
        status: 'full',
        ...geometryFor(benArousTunis.id),
      },
    ])
    .returning();
  if (!ridePublished1 || !ridePublished2 || !ridePublished3 || !ridePublished4) {
    throw new Error('Failed to insert published/full rides');
  }

  await db.insert(rides).values({
    driverProfileId: youssefProfile.id,
    vehicleId: youssefVehicle.id,
    routeId: manoubaTunis.id,
    originLabel: manoubaTunis.originLabel,
    originLat: manoubaTunis.originLat,
    originLng: manoubaTunis.originLng,
    destinationLabel: manoubaTunis.destinationLabel,
    destinationLat: manoubaTunis.destinationLat,
    destinationLng: manoubaTunis.destinationLng,
    departureAt: hoursFromNow(30),
    seatsTotal: 3,
    seatsAvailable: 3,
    contributionPerSeat: priceFor(manoubaTunis.id),
    status: 'draft',
    ...geometryFor(manoubaTunis.id),
  });

  await db.insert(rides).values({
    driverProfileId: hediProfileSafe(),
    vehicleId: vehicleByUserId.get(hedi.id)!.id,
    routeId: sousseMonastir.id,
    originLabel: sousseMonastir.originLabel,
    originLat: sousseMonastir.originLat,
    originLng: sousseMonastir.originLng,
    destinationLabel: sousseMonastir.destinationLabel,
    destinationLat: sousseMonastir.destinationLat,
    destinationLng: sousseMonastir.destinationLng,
    departureAt: hoursFromNow(-5),
    seatsTotal: 3,
    seatsAvailable: 3,
    contributionPerSeat: priceFor(sousseMonastir.id),
    status: 'cancelled',
    ...geometryFor(sousseMonastir.id),
  });

  function hediProfileSafe(): string {
    const p = driverProfileByUserId.get(hedi.id);
    if (!p) throw new Error('Missing Hedi profile');
    return p.id;
  }

  // Phase 6: no per-seed `price` field any more — contributionPerSeat is
  // always priceFor(route.id) below, so a completed ride's price can never
  // silently disagree with the same corridor's other rides.
  const completedRideSeeds = [
    { driver: sarraProfile, vehicle: sarraVehicle, route: elMenzahDigitalCenter, daysBack: 1 },
    { driver: sarraProfile, vehicle: sarraVehicle, route: elMenzahDigitalCenter, daysBack: 2 },
    { driver: amineProfile, vehicle: amineVehicle, route: elMenzahDigitalCenter, daysBack: 3 },
    { driver: mehdiProfile, vehicle: mehdiVehicle, route: laMarsaCentreVille, daysBack: 4 },
    { driver: karimProfile, vehicle: karimVehicle, route: arianaLeBardo, daysBack: 5 },
  ];
  const completedRides = await db
    .insert(rides)
    .values(
      completedRideSeeds.map((s) => ({
        driverProfileId: s.driver.id,
        vehicleId: s.vehicle.id,
        routeId: s.route.id,
        originLabel: s.route.originLabel,
        originLat: s.route.originLat,
        originLng: s.route.originLng,
        destinationLabel: s.route.destinationLabel,
        destinationLat: s.route.destinationLat,
        destinationLng: s.route.destinationLng,
        departureAt: daysAgo(s.daysBack),
        seatsTotal: 3,
        seatsAvailable: 1,
        contributionPerSeat: priceFor(s.route.id),
        status: 'completed' as const,
        ...geometryFor(s.route.id),
      })),
    )
    .returning();

  // ── Bookings + Trips + Ratings ─────────────────────────────────────
  // Pending requests on published rides
  await db.insert(bookings).values([
    {
      rideId: ridePublished1.id,
      riderId: marwa.id,
      seatsRequested: 1,
      contributionTotal: priceFor(elMenzahDigitalCenter.id) * 1,
      status: 'pending',
      pickupLabel: 'Angle Rue de Kairouan',
      pickupLat: elMenzahDigitalCenter.originLat + 0.001,
      pickupLng: elMenzahDigitalCenter.originLng + 0.001,
    },
    {
      rideId: ridePublished2.id,
      riderId: nourSafe(),
      seatsRequested: 2,
      contributionTotal: priceFor(laMarsaCentreVille.id) * 2,
      status: 'pending',
      pickupLabel: 'Avenue Habib Bourguiba, La Marsa',
      pickupLat: laMarsaCentreVille.originLat,
      pickupLng: laMarsaCentreVille.originLng,
    },
  ]);
  function nourSafe(): string {
    return userByName('Nour Khedher').id;
  }

  // Accepted booking on the in-progress ride → active trip
  const [acceptedBookingActive] = await db
    .insert(bookings)
    .values({
      rideId: rideInProgress.id,
      riderId: youssef.id,
      seatsRequested: 1,
      contributionTotal: priceFor(elMenzahDigitalCenter.id) * 1,
      status: 'accepted',
      pickupLabel: 'Angle Rue de Kairouan',
      pickupLat: elMenzahDigitalCenter.originLat + 0.001,
      pickupLng: elMenzahDigitalCenter.originLng + 0.001,
      respondedAt: hoursFromNow(-1),
    })
    .returning();
  if (!acceptedBookingActive) throw new Error('Failed to insert accepted booking');

  await db.insert(trips).values({
    bookingId: acceptedBookingActive.id,
    rideId: rideInProgress.id,
    status: 'active',
    simulationStartedAt: hoursFromNow(-0.08),
  });

  // Accepted booking on a published ride → scheduled trip
  const [acceptedBookingScheduled] = await db
    .insert(bookings)
    .values({
      rideId: ridePublished3.id,
      riderId: salmaSafe(),
      seatsRequested: 1,
      contributionTotal: priceFor(arianaLeBardo.id) * 1,
      status: 'accepted',
      pickupLabel: 'Rue de Palestine, Ariana',
      pickupLat: arianaLeBardo.originLat,
      pickupLng: arianaLeBardo.originLng,
      respondedAt: hoursFromNow(-0.5),
    })
    .returning();
  function salmaSafe(): string {
    return userByName('Salma Guermazi').id;
  }
  if (!acceptedBookingScheduled) throw new Error('Failed to insert scheduled booking');
  await db.insert(trips).values({
    bookingId: acceptedBookingScheduled.id,
    rideId: ridePublished3.id,
    status: 'scheduled',
  });

  // Accepted booking on the full ride → driver_approaching trip
  const [acceptedBookingApproaching] = await db
    .insert(bookings)
    .values({
      rideId: ridePublished4.id,
      riderId: olaSafe(),
      seatsRequested: 1,
      contributionTotal: priceFor(benArousTunis.id) * 1,
      status: 'accepted',
      pickupLabel: 'Rue de la Republique, Ben Arous',
      pickupLat: benArousTunis.originLat,
      pickupLng: benArousTunis.originLng,
      respondedAt: hoursFromNow(-2),
    })
    .returning();
  function olaSafe(): string {
    return userByName('Ola Mejri').id;
  }
  if (!acceptedBookingApproaching) throw new Error('Failed to insert approaching booking');
  await db.insert(trips).values({
    bookingId: acceptedBookingApproaching.id,
    rideId: ridePublished4.id,
    status: 'driver_approaching',
  });

  // Declined / cancelled / expired / no-show bookings for state coverage
  await db.insert(bookings).values([
    {
      rideId: ridePublished1.id,
      riderId: fares(),
      seatsRequested: 1,
      contributionTotal: priceFor(elMenzahDigitalCenter.id) * 1,
      status: 'declined',
      pickupLabel: 'Cité Ennasr',
      pickupLat: elMenzahDigitalCenter.originLat,
      pickupLng: elMenzahDigitalCenter.originLng,
      respondedAt: hoursFromNow(-3),
    },
    {
      rideId: ridePublished2.id,
      riderId: yasmine(),
      seatsRequested: 1,
      contributionTotal: priceFor(laMarsaCentreVille.id) * 1,
      status: 'cancelled_by_rider',
      pickupLabel: 'Gammarth',
      pickupLat: laMarsaCentreVille.originLat,
      pickupLng: laMarsaCentreVille.originLng,
      respondedAt: hoursFromNow(-4),
    },
    {
      rideId: ridePublished3.id,
      riderId: aymen(),
      seatsRequested: 1,
      contributionTotal: priceFor(arianaLeBardo.id) * 1,
      status: 'cancelled_by_driver',
      pickupLabel: 'Le Bardo',
      pickupLat: arianaLeBardo.destinationLat,
      pickupLng: arianaLeBardo.destinationLng,
      respondedAt: hoursFromNow(-6),
    },
    {
      rideId: ridePublished1.id,
      riderId: sonia(),
      seatsRequested: 1,
      contributionTotal: priceFor(elMenzahDigitalCenter.id) * 1,
      status: 'expired',
      pickupLabel: 'El Menzah 6',
      pickupLat: elMenzahDigitalCenter.originLat,
      pickupLng: elMenzahDigitalCenter.originLng,
    },
  ]);
  function fares(): string {
    return userByName('Fares Sahli').id;
  }
  function yasmine(): string {
    return userByName('Yasmine Chtioui').id;
  }
  function aymen(): string {
    return userByName('Aymen Hammami').id;
  }
  function sonia(): string {
    return userByName('Sonia Ferjani').id;
  }

  const noShowRide = completedRides[4];
  if (!noShowRide) throw new Error('Missing ride for no-show booking');
  const [noShowBooking] = await db
    .insert(bookings)
    .values({
      rideId: noShowRide.id,
      riderId: wassim(),
      seatsRequested: 1,
      // noShowRide is completedRides[4] → arianaLeBardo corridor (see
      // completedRideSeeds above).
      contributionTotal: priceFor(arianaLeBardo.id) * 1,
      status: 'no_show',
      pickupLabel: 'Le Bardo',
      pickupLat: arianaLeBardo.destinationLat,
      pickupLng: arianaLeBardo.destinationLng,
      respondedAt: daysAgo(5),
    })
    .returning();
  function wassim(): string {
    return userByName('Wassim Bouazizi').id;
  }
  if (!noShowBooking) throw new Error('Failed to insert no-show booking');
  await db
    .insert(trips)
    .values({ bookingId: noShowBooking.id, rideId: noShowRide.id, status: 'no_show' });

  // Completed bookings + trips + ratings for each completed ride (rider = Youssef throughout, for a coherent relationship signal with Sarra)
  const completedRiders = [youssef, karim, ahmed, marwa, bilel];
  for (let i = 0; i < completedRides.length; i += 1) {
    const ride = completedRides[i];
    const rider = completedRiders[i];
    const seed = completedRideSeeds[i];
    if (!ride || !rider || !seed) continue;

    const [booking] = await db
      .insert(bookings)
      .values({
        rideId: ride.id,
        riderId: rider.id,
        seatsRequested: 1,
        contributionTotal: priceFor(seed.route.id) * 1,
        status: 'completed',
        pickupLabel: seed.route.originLabel,
        pickupLat: seed.route.originLat,
        pickupLng: seed.route.originLng,
        respondedAt: daysAgo(seed.daysBack),
      })
      .returning();
    if (!booking) continue;

    const [trip] = await db
      .insert(trips)
      .values({
        bookingId: booking.id,
        rideId: ride.id,
        status: 'completed',
        simulationStartedAt: daysAgo(seed.daysBack),
        pickupConfirmedAt: daysAgo(seed.daysBack),
        dropoffAt: daysAgo(seed.daysBack),
        riderSettlementConfirmedAt: daysAgo(seed.daysBack),
        driverSettlementConfirmedAt: daysAgo(seed.daysBack),
      })
      .returning();
    if (!trip) continue;

    const driverUserId = [sarra, sarra, amine, mehdi, karim][i]!.id;
    const starsRider = [5, 4, 5, 4, 3][i]!;
    const starsDriver = [5, 5, 4, 5, 4][i]!;

    await db.insert(ratings).values([
      {
        tripId: trip.id,
        raterUserId: rider.id,
        rateeUserId: driverUserId,
        role: 'rider_rates_driver',
        stars: starsRider,
        punctualityFlag: starsRider >= 4,
      },
      {
        tripId: trip.id,
        raterUserId: driverUserId,
        rateeUserId: rider.id,
        role: 'driver_rates_rider',
        stars: starsDriver,
        punctualityFlag: starsDriver >= 4,
      },
    ]);
  }

  // ── Relationship signals ───────────────────────────────────────────
  await db.insert(relationshipSignals).values([
    { userAId: youssef.id, userBId: sarra.id, tripsTogetherCount: 4, lastTripAt: daysAgo(1) },
    { userAId: karim.id, userBId: amine.id, tripsTogetherCount: 2, lastTripAt: daysAgo(3) },
  ]);

  // ── Liquidity / demand signals on an uncommon corridor ─────────────
  await db.insert(demandSignals).values([
    {
      userId: nourSafe(),
      originLabel: 'Tunis Lac 2',
      originLat: 36.8419,
      originLng: 10.2456,
      destinationLabel: 'Sousse',
      destinationLat: 35.8256,
      destinationLng: 10.6369,
      desiredWindowStart: hoursFromNow(5),
      desiredWindowEnd: hoursFromNow(7),
      status: 'open',
    },
    {
      userId: sonia(),
      originLabel: 'Tunis Lac 2',
      originLat: 36.8419,
      originLng: 10.2456,
      destinationLabel: 'Sousse',
      destinationLat: 35.8256,
      destinationLng: 10.6369,
      desiredWindowStart: hoursFromNow(5),
      desiredWindowEnd: hoursFromNow(7.5),
      status: 'open',
    },
    {
      userId: fares(),
      originLabel: 'Tunis Lac 2',
      originLat: 36.8419,
      originLng: 10.2456,
      destinationLabel: 'Sousse',
      destinationLat: 35.8256,
      destinationLng: 10.6369,
      desiredWindowStart: hoursFromNow(6),
      desiredWindowEnd: hoursFromNow(8),
      status: 'open',
    },
  ]);

  // Nearby-corridor rides (Sousse–Monastir direction) so the fallback has something to surface
  await db.insert(rides).values([
    {
      driverProfileId: sarraProfile.id,
      vehicleId: sarraVehicle.id,
      routeId: sousseMonastir.id,
      originLabel: sousseMonastir.originLabel,
      originLat: sousseMonastir.originLat,
      originLng: sousseMonastir.originLng,
      destinationLabel: sousseMonastir.destinationLabel,
      destinationLat: sousseMonastir.destinationLat,
      destinationLng: sousseMonastir.destinationLng,
      departureAt: hoursFromNow(6),
      seatsTotal: 4,
      seatsAvailable: 4,
      contributionPerSeat: priceFor(sousseMonastir.id),
      status: 'published',
      ...geometryFor(sousseMonastir.id),
    },
  ]);

  // ── Search-flow demo rides: 10 drivers × 10 rides, today + tomorrow ──
  // A dedicated, easy-to-eyeball spread for exercising the search flow
  // (explore → results → cluster/route-map → trust) with real variety:
  // every one of the 10 seeded drivers publishes exactly one ride here,
  // rotated across all 8 corridors above (the last 2 repeat a corridor —
  // still a different driver/vehicle/time/price), 5 departing later today
  // and 5 tomorrow at fixed timetable-style hours. All `published` with
  // real seats available so they actually surface as matches, and — like
  // every other seeded ride — `contributionPerSeat` is the corridor's
  // formula-derived `recommended` price, never hand-typed.
  const demoDrivers = [
    sarraProfile,
    youssefProfile,
    mehdiProfile,
    karimProfile,
    hediProfile,
    amineProfile,
    ahmedProfile,
    raniaProfile,
    leilaProfile,
    sarraProfile,
  ];
  const demoVehicles = [
    sarraVehicle,
    youssefVehicle,
    mehdiVehicle,
    karimVehicle,
    hediVehicle,
    amineVehicle,
    ahmedVehicle,
    raniaVehicle,
    leilaVehicle,
    sarraVehicle,
  ];
  const demoCorridors = [
    elMenzahDigitalCenter,
    laMarsaCentreVille,
    arianaLeBardo,
    benArousTunis,
    manoubaTunis,
    sousseMonastir,
    sfaxSakietEzzit,
    tunisNabeul,
    elMenzahDigitalCenter,
    laMarsaCentreVille,
  ];
  const demoDepartures = [
    // Later today — relative to "now" so a seed run at any hour still
    // lands these in the future.
    hoursFromNow(1),
    hoursFromNow(2.5),
    hoursFromNow(4),
    hoursFromNow(6),
    hoursFromNow(8),
    // Tomorrow — fixed timetable hours, always in the future regardless
    // of when the seed runs.
    atTime(1, 7, 30),
    atTime(1, 9, 0),
    atTime(1, 13, 0),
    atTime(1, 16, 0),
    atTime(1, 19, 30),
  ];
  const demoSeatsTotal = [3, 4, 3, 4, 3, 4, 3, 4, 3, 4];
  const demoSeatsAvailable = [2, 4, 1, 3, 3, 2, 3, 4, 1, 2];

  await db.insert(rides).values(
    demoDrivers.map((driver, i) => {
      const vehicle = demoVehicles[i]!;
      const corridor = demoCorridors[i]!;
      return {
        driverProfileId: driver.id,
        vehicleId: vehicle.id,
        routeId: corridor.id,
        originLabel: corridor.originLabel,
        originLat: corridor.originLat,
        originLng: corridor.originLng,
        destinationLabel: corridor.destinationLabel,
        destinationLat: corridor.destinationLat,
        destinationLng: corridor.destinationLng,
        departureAt: demoDepartures[i]!,
        seatsTotal: demoSeatsTotal[i]!,
        seatsAvailable: demoSeatsAvailable[i]!,
        contributionPerSeat: priceFor(corridor.id),
        status: 'published' as const,
        ...geometryFor(corridor.id),
      };
    }),
  );

  // ── Notifications ───────────────────────────────────────────────────
  await db.insert(notifications).values([
    {
      userId: youssef.id,
      type: 'recurring_proactive_match',
      payload: { rideId: rideInProgress.id },
      readAt: null,
    },
    {
      userId: youssef.id,
      type: 'booking_accepted',
      payload: { bookingId: acceptedBookingActive.id },
      readAt: daysAgo(1),
    },
    { userId: youssef.id, type: 'trip_completed', payload: {}, readAt: daysAgo(1) },
    { userId: sarra.id, type: 'booking_requested', payload: {}, readAt: null },
    { userId: nourSafe(), type: 'demand_signal_matched', payload: {}, readAt: null },
  ]);

  console.log('Seed complete.');
  console.log(
    `Routes: 8, Users: ${insertedUsers.length}, Drivers: ${driverSeeds.length}, Search-flow demo rides: ${demoDrivers.length}`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
