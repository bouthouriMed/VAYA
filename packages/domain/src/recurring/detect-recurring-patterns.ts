import { haversineDistanceMeters } from './recurring-geo';
import { dayOfWeekBitForDate } from './day-of-week';
import type { RecurringDetectionConfig } from './recurring-detection-config.types';
import type { DetectedRecurringPattern, TripHistoryRecord } from './trip-history.types';

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const m = Math.round(totalMinutes % 60)
    .toString()
    .padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Greedily groups a user's trip history into same-corridor clusters: a
 * record joins the first existing cluster whose *reference* record (the
 * cluster's first member) is within `corridorRadiusMeters` of both its
 * origin and destination. Deliberately reference-based rather than a
 * running centroid — simpler, deterministic, and avoids centroid drift
 * silently pulling a cluster's effective radius wider than configured as
 * members accumulate. Good enough at the NOW-horizon scale this detection
 * job runs at (per-user trip history, not a spatial index) — see
 * CLAUDE.md's architecture principles on not pre-optimizing before real
 * usage data justifies it.
 */
function clusterByCorridor(
  history: TripHistoryRecord[],
  corridorRadiusMeters: number,
): TripHistoryRecord[][] {
  const clusters: TripHistoryRecord[][] = [];
  for (const record of history) {
    const cluster = clusters.find((c) => {
      const ref = c[0]!;
      return (
        haversineDistanceMeters(
          { lat: ref.originLat, lng: ref.originLng },
          { lat: record.originLat, lng: record.originLng },
        ) <= corridorRadiusMeters &&
        haversineDistanceMeters(
          { lat: ref.destinationLat, lng: ref.destinationLng },
          { lat: record.destinationLat, lng: record.destinationLng },
        ) <= corridorRadiusMeters
      );
    });
    if (cluster) cluster.push(record);
    else clusters.push([record]);
  }
  return clusters;
}

/**
 * Pure, no-I/O recurring-pattern detection over one user's trip history
 * (already scoped to a single role — driver or rider — by the caller).
 * Clusters trips by corridor, then for each cluster meeting
 * `config.minTripCount` computes a `confidenceScore` from two independent
 * signals:
 *
 *   confidenceScore = tripCountFactor * 0.6 + timeConsistencyFactor * 0.4
 *
 * where `tripCountFactor` rises linearly to 1.0 at
 * `config.fullConfidenceTripCount` trips, and `timeConsistencyFactor` falls
 * linearly to 0 as the cluster's observed departure-time spread approaches
 * `config.timeWindowMinutes`. Trip count is weighted higher (0.6 vs 0.4)
 * because repetition is the primary signal a pattern exists at all — time
 * consistency refines *how* prompt-worthy it is, but a highly consistent
 * time window across only the bare minimum trips shouldn't outrank a
 * strong, well-established repeat corridor with a looser schedule.
 *
 * Clusters below `config.minTripCount` are not real patterns yet and are
 * dropped entirely — "when found" (docs/roadmap/phase-11-recurring-rides.md)
 * means found, not merely hinted at by one or two trips.
 */
export function detectRecurringPatterns(
  history: TripHistoryRecord[],
  config: RecurringDetectionConfig,
): DetectedRecurringPattern[] {
  const clusters = clusterByCorridor(history, config.corridorRadiusMeters);
  const patterns: DetectedRecurringPattern[] = [];

  for (const cluster of clusters) {
    if (cluster.length < config.minTripCount) continue;

    const originLat = average(cluster.map((r) => r.originLat));
    const originLng = average(cluster.map((r) => r.originLng));
    const destinationLat = average(cluster.map((r) => r.destinationLat));
    const destinationLng = average(cluster.map((r) => r.destinationLng));

    // Real place-name labels from the most recent trip beat an averaged
    // coordinate with no label of its own — labels don't average.
    const mostRecent = [...cluster].sort(
      (a, b) => b.departureAt.getTime() - a.departureAt.getTime(),
    )[0]!;

    let daysOfWeekMask = 0;
    for (const r of cluster) {
      daysOfWeekMask |= 1 << dayOfWeekBitForDate(r.departureAt);
    }

    const minutesOfDay = cluster.map((r) => minutesSinceMidnight(r.departureAt));
    const minMinutes = Math.min(...minutesOfDay);
    const maxMinutes = Math.max(...minutesOfDay);
    const spreadMinutes = maxMinutes - minMinutes;

    const tripCountFactor = clamp01(cluster.length / config.fullConfidenceTripCount);
    const timeConsistencyFactor = clamp01(1 - spreadMinutes / config.timeWindowMinutes);
    const confidenceScore =
      Math.round((tripCountFactor * 0.6 + timeConsistencyFactor * 0.4) * 100) / 100;

    patterns.push({
      originLabel: mostRecent.originLabel,
      originLat,
      originLng,
      destinationLabel: mostRecent.destinationLabel,
      destinationLat,
      destinationLng,
      daysOfWeekMask,
      timeWindowStart: formatMinutes(minMinutes),
      timeWindowEnd: formatMinutes(maxMinutes),
      confidenceScore,
      tripCount: cluster.length,
    });
  }

  return patterns;
}
