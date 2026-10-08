import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requestPushPermissionAndRegister,
  unregisterThisDevice,
} from '../registerForPushNotifications';

const mocks = vi.hoisted(() => ({
  getPushPermissionStatus: vi.fn(),
  requestPushPermission: vi.fn(),
  currentDevicePlatform: vi.fn(),
  ensureAndroidNotificationChannel: vi.fn(),
  getExpoPushToken: vi.fn(),
  trackEvent: vi.fn(),
  captureException: vi.fn(),
}));

// Mocks the boundary modules (the expo-notifications wrapper, analytics,
// monitoring) rather than expo-notifications itself, so this exercises the
// real orchestration: prompt only while undetermined, register on every
// granted call, never throw.
vi.mock('../notificationClient', () => ({
  getPushPermissionStatus: mocks.getPushPermissionStatus,
  requestPushPermission: mocks.requestPushPermission,
  currentDevicePlatform: mocks.currentDevicePlatform,
  ensureAndroidNotificationChannel: mocks.ensureAndroidNotificationChannel,
  getExpoPushToken: mocks.getExpoPushToken,
}));
vi.mock('../../analytics/analytics', () => ({ trackEvent: mocks.trackEvent }));
vi.mock('../../monitoring/sentry', () => ({ captureException: mocks.captureException }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureAndroidNotificationChannel.mockResolvedValue(undefined);
  mocks.currentDevicePlatform.mockReturnValue('ios');
  mocks.getExpoPushToken.mockResolvedValue('ExponentPushToken[xyz]');
});

describe('requestPushPermissionAndRegister', () => {
  it('re-registers the token on every call once permission is already granted, without prompting', async () => {
    mocks.getPushPermissionStatus.mockResolvedValue('granted');
    const registerPushToken = vi.fn().mockResolvedValue(undefined);

    await expect(requestPushPermissionAndRegister(registerPushToken)).resolves.toBe(true);
    await expect(requestPushPermissionAndRegister(registerPushToken)).resolves.toBe(true);

    expect(mocks.requestPushPermission).not.toHaveBeenCalled();
    expect(registerPushToken).toHaveBeenCalledTimes(2);
    expect(registerPushToken).toHaveBeenCalledWith({ token: 'ExponentPushToken[xyz]', platform: 'ios' });
  });

  it('prompts while undetermined, tracks the grant, then registers', async () => {
    mocks.getPushPermissionStatus.mockResolvedValue('undetermined');
    mocks.requestPushPermission.mockResolvedValue('granted');
    const registerPushToken = vi.fn().mockResolvedValue(undefined);

    await expect(requestPushPermissionAndRegister(registerPushToken)).resolves.toBe(true);

    expect(mocks.requestPushPermission).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent).toHaveBeenCalledWith('push_permission_granted');
    expect(mocks.ensureAndroidNotificationChannel).toHaveBeenCalled();
    expect(registerPushToken).toHaveBeenCalledTimes(1);
  });

  it('tracks a denial from the prompt and registers nothing', async () => {
    mocks.getPushPermissionStatus.mockResolvedValue('undetermined');
    mocks.requestPushPermission.mockResolvedValue('denied');
    const registerPushToken = vi.fn();

    await expect(requestPushPermissionAndRegister(registerPushToken)).resolves.toBe(false);

    expect(mocks.trackEvent).toHaveBeenCalledWith('push_permission_denied');
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('never re-prompts after an earlier refusal', async () => {
    mocks.getPushPermissionStatus.mockResolvedValue('denied');
    const registerPushToken = vi.fn();

    await expect(requestPushPermissionAndRegister(registerPushToken)).resolves.toBe(false);

    expect(mocks.requestPushPermission).not.toHaveBeenCalled();
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('does nothing (no denial tracked) where push is unavailable, e.g. Expo Go on Android', async () => {
    mocks.getPushPermissionStatus.mockResolvedValue('unavailable');
    const registerPushToken = vi.fn();

    await expect(requestPushPermissionAndRegister(registerPushToken)).resolves.toBe(false);

    expect(mocks.trackEvent).not.toHaveBeenCalled();
    expect(mocks.getExpoPushToken).not.toHaveBeenCalled();
  });

  it('does not register when no token could be obtained (e.g. missing push credentials)', async () => {
    mocks.getPushPermissionStatus.mockResolvedValue('granted');
    mocks.getExpoPushToken.mockResolvedValue(null);
    const registerPushToken = vi.fn();

    await expect(requestPushPermissionAndRegister(registerPushToken)).resolves.toBe(false);
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('reports a registration failure to monitoring instead of throwing', async () => {
    mocks.getPushPermissionStatus.mockResolvedValue('granted');
    const error = new Error('network error');
    const registerPushToken = vi.fn().mockRejectedValue(error);

    await expect(requestPushPermissionAndRegister(registerPushToken)).resolves.toBe(false);
    expect(mocks.captureException).toHaveBeenCalledWith(error);
  });
});

describe('unregisterThisDevice', () => {
  it('sends this device token to the server when push is granted', async () => {
    mocks.getPushPermissionStatus.mockResolvedValue('granted');
    const unregister = vi.fn().mockResolvedValue(undefined);

    await unregisterThisDevice(unregister);

    expect(unregister).toHaveBeenCalledWith({ token: 'ExponentPushToken[xyz]' });
  });

  it('is a no-op without permission and never throws on failure', async () => {
    mocks.getPushPermissionStatus.mockResolvedValue('denied');
    const unregister = vi.fn();
    await unregisterThisDevice(unregister);
    expect(unregister).not.toHaveBeenCalled();

    mocks.getPushPermissionStatus.mockResolvedValue('granted');
    const failing = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(unregisterThisDevice(failing)).resolves.toBeUndefined();
  });
});
