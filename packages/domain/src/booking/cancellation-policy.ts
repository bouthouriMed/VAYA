/**
 * Cancellation & no-show policy (Phase 10 —
 * docs/roadmap/phase-10-cancellation-no-show.md). Pure logic, no I/O —
 * mirrors the rest of packages/domain's state-machine-style modules
 * (booking-status.ts, trip-status.ts, rating/trust-tier.ts).
 *
 * **The business decision this module encodes** (docs/roadmap/README.md's
 * Open Decision #4, resolved here): VAYA has no payment system yet, so a
 * BlaBlaCar-style refund-percentage policy (docs/product/benchmark.md §2)
 * doesn't transfer — there is nothing to refund. The meaningful consequence
 * today is reputation-based, informed by (not copied from) the benchmark's
 * >24h / <24h / <30min time structure:
 *
 *  - **free** (≥24h before departure): no consequence. Cancelling with a
 *    full day's notice is normal marketplace behavior, not a reliability
 *    problem — charging a reputation cost here would just teach users to
 *    stop cancelling honestly and instead silently no-show instead, which
 *    is strictly worse for the other party.
 *  - **moderate** (<24h but ≥30min before departure): a real, if minor,
 *    inconvenience to the other party (a driver losing a rider close to
 *    departure can rarely refill the seat; a rider losing a ride this late
 *    has few alternatives). Counts against reliability (weighted penalty
 *    points — see `CANCELLATION_PENALTY_POINTS`) but never triggers an
 *    automatic low rating — the cancelling party still *told* the other
 *    party, which is meaningfully better behavior than silence.
 *  - **severe** (<30min before departure, including after departure —
 *    i.e. any cancellation that could not possibly let the other party
 *    adjust their plans): a materially bigger reliability penalty, but
 *    still not an automatic low rating — that consequence is reserved for
 *    a *reported no-show* (`canReportNoShow`/`NO_SHOW_PENALTY_POINTS`
 *    below), which is a distinct, worse failure (the other party is left
 *    waiting with zero information, not just short notice).
 *
 * Full reasoning and the resolved open decision: `docs/domain/cancellation-policy.md`.
 */

export const CANCELLATION_TIERS = ['free', 'moderate', 'severe'] as const;
export type CancellationTier = (typeof CANCELLATION_TIERS)[number];

/**
 * A lightweight, required, fixed-set reason (spec §38 — matrix M-110):
 * "Pre-trip-start: both driver and passenger can cancel with a lightweight
 * required reason from a fixed set." Confirmed live (this pass) that no
 * *mechanism* previously existed anywhere in the codebase — not a mobile UI
 * picker component, not a persisted column, not a request-body field —
 * `POST /bookings/:bookingId/cancel` accepted an empty body and
 * `cancelBooking` took no reason parameter at all. The four values here
 * exactly match `apps/mobile`'s pre-existing (already French/English/Arabic
 * translated) `booking:cancellation.reasons.*` i18n keys, which were already
 * present but orphaned — no UI component ever rendered them before this
 * pass. Shared by both roles (driver/rider) since the persisted column and
 * the spec's own wording are role-agnostic.
 */
export const CANCELLATION_REASONS = ['change_of_plans', 'found_alternative', 'emergency', 'other'] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

/** ≥24h before departure is the free-cancellation window. */
export const CANCELLATION_FREE_WINDOW_HOURS = 24;
/** ≥30min (but <24h) before departure is the moderate window; below this is severe. */
export const CANCELLATION_MODERATE_WINDOW_MINUTES = 30;

/**
 * Weighted reliability-penalty points applied to the cancelling party's
 * profile (`driver_profiles`/`rider_profiles`, Phase 10's new
 * `reliabilityPenaltyPoints` column) — "counts more heavily" for a later
 * cancellation is expressed as a bigger point value, not a separate
 * mechanism. Raw counts, not a 0-1 score: honest about being a first-cut
 * signal rather than a fabricated precision score (CLAUDE.md's "never
 * show fabricated success" principle applies just as much to fabricated
 * precision).
 */
export const CANCELLATION_PENALTY_POINTS: Record<CancellationTier, number> = {
  free: 0,
  moderate: 1,
  severe: 3,
};

/** A reported no-show is weighted heavier than even a severe-tier cancellation. */
export const NO_SHOW_PENALTY_POINTS = 5;

/** The "automatic low rating" the phase doc calls for — a fixed, minimum star rating inserted for the no-show party, distinct from a genuine subjective rating. */
export const NO_SHOW_AUTOMATIC_RATING_STARS = 1;

/**
 * A no-show cannot be reported before the scheduled departure time at all,
 * and this adds a further small grace buffer past it — the business rule
 * this phase requires ("cannot mark someone no-show before the scheduled
 * time"), plus enough slack that a driver two minutes late from traffic
 * isn't reportable the instant the clock ticks over. Deliberately shorter
 * than the 30-minute moderate/severe cancellation boundary above: by this
 * point contact should already have been attempted (the UI's guidance
 * text), not "wait as long as a late cancellation would have been free."
 */
export const NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE = 15;

export const CANCELLATION_TIER_LABELS: Record<CancellationTier, string> = {
  free: 'Annulation gratuite',
  moderate: 'Annulation tardive',
  severe: 'Annulation de dernière minute',
};

/** French, ready-to-display consequence copy — kept here (not re-derived
 *  client-side) so the preview call and the final applied response can
 *  never disagree about what a tier means, the same "single source of
 *  truth for user-facing consequence text" discipline
 *  `TRUST_TIER_LABELS` already established in rating/trust-tier.ts. */
export const CANCELLATION_TIER_CONSEQUENCES: Record<CancellationTier, string> = {
  free: "Aucune conséquence : vous annulez plus de 24h avant le départ.",
  moderate:
    "Cette annulation a lieu à moins de 24h du départ. Elle sera comptabilisée dans votre score de fiabilité, mais n'affecte pas votre note.",
  severe:
    "Cette annulation a lieu à moins de 30 minutes du départ (ou après). Elle aura un impact important sur votre score de fiabilité.",
};

export interface CancellationPolicyResult {
  tier: CancellationTier;
  /** Minutes between the cancellation instant and departure — negative once departure has passed. */
  minutesBeforeDeparture: number;
  penaltyPoints: number;
  consequence: string;
}

/**
 * Given a ride's `departureAt` and the instant a cancellation happens,
 * compute which policy tier applies. Pure function of two timestamps — no
 * DB/clock access here, so both the read-only preview endpoint and the
 * final cancel endpoint can call this with the same guarantee of agreeing
 * (the only difference between them is *when* `cancelledAt` is captured).
 */
export function computeCancellationPolicy(
  departureAt: Date,
  cancelledAt: Date,
): CancellationPolicyResult {
  const minutesBeforeDeparture = (departureAt.getTime() - cancelledAt.getTime()) / 60_000;

  let tier: CancellationTier;
  if (minutesBeforeDeparture >= CANCELLATION_FREE_WINDOW_HOURS * 60) {
    tier = 'free';
  } else if (minutesBeforeDeparture >= CANCELLATION_MODERATE_WINDOW_MINUTES) {
    tier = 'moderate';
  } else {
    tier = 'severe';
  }

  return {
    tier,
    minutesBeforeDeparture,
    penaltyPoints: CANCELLATION_PENALTY_POINTS[tier],
    consequence: CANCELLATION_TIER_CONSEQUENCES[tier],
  };
}

/**
 * The no-show business rule: reporting is only allowed once at least
 * `NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE` minutes have passed since
 * `departureAt`. Server-side enforcement point (bookings.service.ts's
 * reportNoShow) — the mobile UI's guidance text about attempting contact
 * first is a nicety on top of this, not a substitute for it.
 */
export function canReportNoShow(departureAt: Date, reportedAt: Date): boolean {
  const minutesPastDeparture = (reportedAt.getTime() - departureAt.getTime()) / 60_000;
  return minutesPastDeparture >= NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE;
}

/**
 * No-show should be contextual (spec §37 — matrix M-102): "A passenger
 * sitting at home should not simply be able to report: Driver is a no-show.
 * The action becomes relevant around: scheduled pickup time, pickup
 * location, driver/passenger physical proximity, expected arrival window."
 *
 * Extends `canReportNoShow`'s already-shipped, already-correct time gate
 * (left completely unmodified, still the sole rule when no location fix is
 * available) with a location-proximity check: reporting requires the
 * reporter to genuinely be near the meeting point, not merely that the
 * clock has ticked past the grace period. Missing location data degrades
 * gracefully to the existing time-only behavior — a report from a passenger
 * whose phone has no GPS fix must not become permanently unreportable, since
 * `canReportNoShow`'s current time-only path is itself a real, valid path
 * today and must keep working unchanged.
 *
 * Pure function: no I/O.
 */
export const NO_SHOW_MAX_REPORTER_DISTANCE_METERS = 200;

export interface NoShowReportEvidence {
  /** The reporter's distance from the scheduled meeting point, in meters —
   *  `null` when no location fix is available. */
  reporterDistanceMetersFromMeetingPoint: number | null;
}

export type NoShowReportReason = 'time_not_elapsed' | 'reporter_too_far' | 'ok';

export interface NoShowReportResult {
  allowed: boolean;
  reason: NoShowReportReason;
}

export function evaluateNoShowReport(
  departureAt: Date,
  reportedAt: Date,
  evidence: NoShowReportEvidence,
): NoShowReportResult {
  if (!canReportNoShow(departureAt, reportedAt)) {
    return { allowed: false, reason: 'time_not_elapsed' };
  }

  const { reporterDistanceMetersFromMeetingPoint } = evidence;
  if (
    reporterDistanceMetersFromMeetingPoint !== null &&
    reporterDistanceMetersFromMeetingPoint > NO_SHOW_MAX_REPORTER_DISTANCE_METERS
  ) {
    return { allowed: false, reason: 'reporter_too_far' };
  }

  return { allowed: true, reason: 'ok' };
}
