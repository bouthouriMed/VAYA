import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const featuresDir = path.resolve(dirname, '../features/bookings');
const appDir = path.resolve(dirname, '../../app');

function readSource(dir: string, relativePath: string): string {
  return readFileSync(path.join(dir, relativePath), 'utf-8');
}

/**
 * Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md)'s required
 * mobile test: "the cancellation confirmation flow showing the correct
 * policy consequence for a given timing scenario." The timing-scenario ->
 * tier computation itself is a real, fully unit-tested pure function
 * (packages/domain/src/booking/__tests__/cancellation-policy.test.ts) and
 * the tier -> badge/copy mapping is unit-tested in
 * cancellationHelpers.test.ts. What's left to guard here, given this repo
 * has no React Native component-rendering harness (same constraint
 * booking-screens-real-data.test.ts and pickup-point-screen.test.ts already
 * document), is a source-level regression: CancellationSheet must actually
 * fetch the server-computed preview and render its real `consequence`
 * text — not a hardcoded/local guess — and must gate the destructive
 * confirm action on that preview having loaded, so the consequence is
 * genuinely shown *before* the user can commit (the phase doc's explicit
 * "no surprise outcomes" requirement).
 */
describe('CancellationSheet shows the server-computed policy consequence before confirming', () => {
  const source = readSource(featuresDir, 'CancellationSheet.tsx');

  it('fetches the read-only cancellation preview, not a client-derived guess', () => {
    expect(source).toContain('useGetCancellationPreviewQuery');
  });

  it('renders the preview\'s real consequence text, not a hardcoded string', () => {
    expect(source).toContain('preview.consequence');
  });

  it('disables the confirm action until the preview has actually loaded', () => {
    expect(source).toMatch(/disabled=\{isFetching \|\| !preview\}/);
  });

  it('only fires the destructive cancel mutation from the confirm handler, never on open', () => {
    expect(source).toContain('useCancelBookingMutation');
    expect(source).toMatch(/function handleConfirm/);
  });

  it('tracks booking_cancelled with the role and the server-applied tier as the time bucket', () => {
    expect(source).toContain("trackEvent(");
    expect(source).toContain('buildCancellationAnalyticsPayload(role, result.cancellationPolicy.tier)');
  });
});

describe('NoShowReportSheet enforces guidance-not-gate contact copy and real server enforcement', () => {
  const source = readSource(featuresDir, 'NoShowReportSheet.tsx');

  it('shows contact-first guidance text rather than blocking the action outright', () => {
    expect(source).toMatch(/contacter/);
  });

  it('relies on the server for the minimum-time-past-departure rule (no local time gate)', () => {
    expect(source).not.toMatch(/departureAt/);
    expect(source).toContain('useReportNoShowMutation');
  });

  it('tracks no_show_reported with the reporting role', () => {
    expect(source).toContain("trackEvent('no_show_reported', { role })");
  });
});

describe('trip-day and pre-trip screens wire the Phase 10 affordances', () => {
  it('(tabs)/trips.tsx opens CancellationSheet instead of firing cancelBooking directly on tap', () => {
    const source = readSource(path.join(appDir, '(tabs)'), 'trips.tsx');
    expect(source).toContain('CancellationSheet');
    expect(source).not.toMatch(/onPress=\{\(\) => void cancelBooking\(booking\.id\)\}/);
  });

  it('bookings/live.tsx offers both cancellation and no-show reporting', () => {
    const source = readSource(path.join(appDir, 'bookings'), 'live.tsx');
    expect(source).toContain('CancellationSheet');
    expect(source).toContain('NoShowReportSheet');
  });

  it('bookings/pending.tsx and pickup.tsx both offer cancellation', () => {
    for (const screen of ['pending.tsx', 'pickup.tsx']) {
      const source = readSource(path.join(appDir, 'bookings'), screen);
      expect(source).toContain('CancellationSheet');
    }
  });
});
