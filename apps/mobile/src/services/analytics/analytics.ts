import { store } from '../../state/store';
import { api, type AnalyticsEventInput } from '../../state/api';
import { toEventInput, type AnalyticsEventPayload } from './eventMapping';

export type { AnalyticsEventPayload };

/**
 * Real analytics sink (docs/domain/admin-platform.md) — replaces the old
 * dev-only `console.log` no-op this file's previous doc comment explicitly
 * flagged as a placeholder ("swap this implementation for a real sink...
 * when one is actually adopted"). Every existing `trackEvent(name, payload)`
 * call site in the app keeps working unchanged — same exported signature.
 *
 * Batches in memory and flushes to `POST /analytics/events` (max 50 events
 * per request, server-enforced) on a short idle debounce or once the batch
 * gets large, whichever comes first — never one HTTP request per event.
 * Best-effort throughout: a failed flush is dropped, never retried, never
 * surfaced to the user — analytics must never be allowed to affect a real
 * user action (the same "best-effort, never blocking" discipline
 * `notifyBestEffort` already applies server-side, mirrored here client-side).
 *
 * The event-shape mapping itself (`toEventInput`) lives in `./eventMapping`
 * — a pure, store-free module so it can be unit-tested (analytics.test.ts)
 * without pulling in the real Redux/RTK Query runtime this file needs for
 * the actual dispatch.
 */
const FLUSH_DEBOUNCE_MS = 2000;
const FLUSH_AT_BATCH_SIZE = 20;
const MAX_EVENTS_PER_REQUEST = 50;

let queue: AnalyticsEventInput[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
}

function flush(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;

  const accessToken = store.getState().auth.accessToken;
  const batch = queue.slice(0, MAX_EVENTS_PER_REQUEST);
  queue = queue.slice(MAX_EVENTS_PER_REQUEST);

  if (!accessToken) {
    // Never queue-and-retry across an unauthenticated gap — an anonymous
    // browsing session's events are simply dropped, matching this sink's
    // own "best-effort, never a reason to add complexity" scope.
    if (queue.length > 0) scheduleFlush();
    return;
  }

  store
    .dispatch(api.endpoints.ingestAnalyticsEvents.initiate(batch))
    .unwrap()
    .catch(() => {
      // Best-effort: dropped, never retried.
    });

  if (queue.length > 0) scheduleFlush();
}

export function trackEvent(name: string, payload: AnalyticsEventPayload = {}): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[analytics] ${name}`, payload);
  }
  queue.push(toEventInput(name, payload));
  if (queue.length >= FLUSH_AT_BATCH_SIZE) {
    flush();
  } else {
    scheduleFlush();
  }
}
