/**
 * Thin analytics hook point — there is no analytics/telemetry infrastructure
 * anywhere in this codebase yet (verified: no existing trackEvent/logEvent
 * pattern to extend). Standing up a real event pipeline (batching, a
 * backend sink, PII scrubbing, etc.) is out of scope for this phase; this
 * exists only so call sites have one clearly-named, swappable place to
 * report the events docs/roadmap/phase-04-ride-engine-driver-stops.md
 * requires, instead of scattering ad-hoc console.log calls or inventing a
 * whole analytics system prematurely (CLAUDE.md's architecture
 * principles). Swap this implementation for a real sink (Segment,
 * PostHog, a first-party ingest endpoint, ...) when one is actually
 * adopted — call sites don't need to change.
 */
export type AnalyticsEventPayload = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(name: string, payload: AnalyticsEventPayload = {}): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[analytics] ${name}`, payload);
  }
}
