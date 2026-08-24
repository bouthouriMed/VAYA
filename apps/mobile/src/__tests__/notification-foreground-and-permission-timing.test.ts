import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(dirname, '../../app');
const srcDir = path.resolve(dirname, '../../src');

function read(base: string, relativePath: string): string {
  return readFileSync(path.join(base, relativePath), 'utf-8');
}

/**
 * No React Native component-rendering harness exists in this repo (no
 * @testing-library/react-native, environment: 'node' in vitest.config.ts —
 * same gap booking-screens-real-data.test.ts documents), and
 * useNotificationSetup.ts calls useToast()/useEffect, which needs a real
 * React tree to execute meaningfully. This is a source-level regression
 * guard instead, encoding the current behavioral requirements:
 *  1. foreground notification delivery renders via Toast, not the native
 *     banner (which notificationClient.ts's handler suppresses);
 *  2. push permission is requested as soon as the user is authenticated
 *     (PushPermissionBridge.tsx, mounted at the app root) — phase-07's
 *     original "contextual only, never on cold start" timing has been
 *     superseded by explicit product direction to ask upfront. The two
 *     original contextual call sites (driver/publish.tsx,
 *     search/ride-details.tsx) remain as harmless fallbacks — the
 *     once-per-install guard in pushPermissionStorage.ts means whichever
 *     fires first wins.
 */
describe('notification foreground display and permission-prompt timing', () => {
  it('useNotificationSetup shows a Toast and tracks notification_delivered on foreground delivery', () => {
    const source = read(srcDir, 'services/notifications/useNotificationSetup.ts');
    expect(source).toContain('addNotificationReceivedListener');
    expect(source).toContain('toast({');
    expect(source).toContain("trackEvent('notification_delivered'");
  });

  it('useNotificationSetup tracks notification_tapped and resolves a deep link on tap', () => {
    const source = read(srcDir, 'services/notifications/useNotificationSetup.ts');
    expect(source).toContain('addNotificationResponseReceivedListener');
    expect(source).toContain("trackEvent('notification_tapped'");
    expect(source).toContain('resolveNotificationDeepLink');
  });

  it('notificationClient suppresses the native foreground banner (Toast owns foreground display instead)', () => {
    const source = read(srcDir, 'services/notifications/notificationClient.ts');
    expect(source).toContain('setNotificationHandler');
    expect(source).toContain('shouldShowBanner: false');
  });

  it('root layout mounts PushPermissionBridge to request push permission on cold start', () => {
    const source = read(appDir, '_layout.tsx');
    expect(source).toContain('PushPermissionBridge');
    // The listener bridge (foreground Toast + tap deep-link) stays mounted
    // unconditionally too — listening alone never triggers an OS dialog,
    // PushPermissionBridge is the one that actually requests permission.
    expect(source).toContain('NotificationBridge');
  });

  it('PushPermissionBridge requests permission as soon as the user is authenticated, at most once', () => {
    const source = read(srcDir, 'services/notifications/PushPermissionBridge.tsx');
    expect(source).toContain('requestPushPermissionAndRegister(');
    expect(source).toContain('s.auth.accessToken');
    // Guards against re-firing on every re-render once authenticated —
    // requestPushPermissionAndRegister's own once-per-install SecureStore
    // flag is the real dedup, this ref just avoids redundant calls within
    // a single session.
    expect(source).toContain('attempted.current');
  });

  it('(tabs)/publish.tsx requests push permission only after a successful publish, not before', () => {
    const source = read(appDir, '(tabs)/publish.tsx');
    const publishCallIndex = source.indexOf('await publishRide(rideId).unwrap();');
    const promptCallIndex = source.indexOf('requestPushPermissionAndRegister(');
    expect(publishCallIndex).toBeGreaterThan(-1);
    expect(promptCallIndex).toBeGreaterThan(publishCallIndex);
  });

  it('search/ride-details.tsx requests push permission only after a successful booking request, not before', () => {
    const source = read(appDir, 'search/ride-details.tsx');
    const bookingCallIndex = source.indexOf('const booking = await createBooking(');
    const promptCallIndex = source.indexOf('requestPushPermissionAndRegister(');
    expect(bookingCallIndex).toBeGreaterThan(-1);
    expect(promptCallIndex).toBeGreaterThan(bookingCallIndex);
  });
});
