/**
 * Automatic No-Show Classification (spec §37 — matrix M-104): "VAYA may also
 * automatically classify one when evidence is sufficiently strong." Not
 * mandatory (the spec's own "may"), but must not be precluded — this is the
 * "in principle possible" capability the matrix's own row asks for, built as
 * a real, wired mechanism rather than left structurally impossible.
 *
 * Only the driver ever broadcasts live location in this codebase
 * (trips.service.ts's updateTripLocation authorizes the driver only) — so
 * "sufficiently strong evidence" can only ever be built from the driver's
 * side of the encounter, never the passenger's. That asymmetry shapes both
 * branches below:
 *
 *  - A passenger no-show is inferred from the driver having genuinely
 *    waited, in person, at the pickup point for a long sustained stretch
 *    with no boarding ever occurring — the same "arrived and stayed" fact
 *    `evaluateBoarding`'s sustained-proximity signal already anchors on for
 *    the opposite (positive) outcome.
 *  - A driver no-show is inferred from the ride's departure having passed by
 *    a generous margin while the driver's phone was demonstrably still
 *    broadcasting location (ruling out "phone off/app killed", the
 *    ambiguous case that must NOT auto-classify) yet that location never
 *    once came near the ride's own origin.
 *
 * Conservative when ambiguous, same discipline as `evaluateBoarding`/
 * `evaluateAutoStart`: no location data at all, or a trip merely running
 * late with no corroborating signal either way, never classifies — silence
 * is not evidence.
 *
 * Pure function: no I/O. The caller (trip-staleness sweep) is responsible
 * for computing each input from real trip/booking/location data and for
 * actually applying whichever outcome this returns.
 */

export type TrackableForNoShow = 'scheduled' | 'pickup';

export interface NoShowAutoClassificationSignals {
  /** The trip's current status — only 'scheduled' (driver never arrived) and
   *  'pickup' (driver arrived, boarding never confirmed) are evaluated; any
   *  other status returns 'insufficient_evidence' unconditionally. */
  tripStatus: TrackableForNoShow | (string & {});
  /** Milliseconds since the driver's confirmed arrival at the pickup point
   *  (trips.pickupConfirmedAt) — null if the trip never reached `pickup`. */
  msSincePickupConfirmed: number | null;
  /** Milliseconds since the ride's scheduled departureAt (negative if not
   *  yet reached). */
  msSinceDeparture: number;
  /** Whether the driver's phone has produced at least one real location fix
   *  since departure — distinguishes genuine absence-of-evidence (phone
   *  off, app killed, connectivity dead) from an actively-tracked driver who
   *  simply never came near the pickup point. */
  driverLocationActiveSinceDeparture: boolean;
  /** Whether that active broadcast ever showed the driver within
   *  pickup-arrival radius of the ride's origin, at any point since
   *  departure (trips.driverEverNearOriginAt != null). */
  driverEverNearOrigin: boolean;
}

export type NoShowAutoClassificationReason =
  | 'insufficient_evidence'
  | 'passenger_absent_after_driver_waited'
  | 'driver_never_arrived_despite_active_tracking';

export interface NoShowAutoClassificationResult {
  shouldClassify: boolean;
  /** The party the automatic classification would report as the no-show —
   *  null when shouldClassify is false. */
  reportedParty: 'driver' | 'rider' | null;
  reason: NoShowAutoClassificationReason;
}

/** How long the driver must have genuinely waited at the pickup point,
 *  confirmed arrived, with boarding still never confirmed, before a
 *  passenger no-show is strong enough evidence to auto-classify. Deliberately
 *  much longer than `NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE`'s manual-report
 *  gate (15 min) — an automatic classification with no human judgment in the
 *  loop should only ever fire once the wait is genuinely unreasonable. */
export const AUTO_NO_SHOW_PICKUP_WAIT_MS = 20 * 60 * 1000;

/** How long past departure, with the trip never even reaching
 *  `driver_approaching`, before an actively-tracked-but-absent driver counts
 *  as a no-show. Generous for the same reason as above — this fires with no
 *  human confirmation at all. */
export const AUTO_NO_SHOW_DRIVER_GRACE_MS = 45 * 60 * 1000;

export function evaluateAutoNoShowClassification(
  signals: NoShowAutoClassificationSignals,
): NoShowAutoClassificationResult {
  if (
    signals.tripStatus === 'pickup' &&
    signals.msSincePickupConfirmed !== null &&
    signals.msSincePickupConfirmed >= AUTO_NO_SHOW_PICKUP_WAIT_MS
  ) {
    return { shouldClassify: true, reportedParty: 'rider', reason: 'passenger_absent_after_driver_waited' };
  }

  if (
    signals.tripStatus === 'scheduled' &&
    signals.msSinceDeparture >= AUTO_NO_SHOW_DRIVER_GRACE_MS &&
    signals.driverLocationActiveSinceDeparture &&
    !signals.driverEverNearOrigin
  ) {
    return {
      shouldClassify: true,
      reportedParty: 'driver',
      reason: 'driver_never_arrived_despite_active_tracking',
    };
  }

  return { shouldClassify: false, reportedParty: null, reason: 'insufficient_evidence' };
}
