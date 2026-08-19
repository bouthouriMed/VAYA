import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestPushPermissionAndRegister } from '../registerForPushNotifications';

const mocks = vi.hoisted(() => ({
  hasPrompted: vi.fn(),
  markPrompted: vi.fn(),
  requestPushPermission: vi.fn(),
  currentDevicePlatform: vi.fn(),
  ensureAndroidNotificationChannel: vi.fn(),
  getExpoPushToken: vi.fn(),
  trackEvent: vi.fn(),
}));

// Mocks the two boundary modules (SecureStore-backed storage and the
// expo-notifications wrapper) rather than expo-notifications itself, so
// this exercises requestPushPermissionAndRegister's real orchestration
// logic (prompt-once gating, granted/denied branching, token registration,
// swallowing a registration failure) without depending on any native
// module being available under vitest's node environment.
vi.mock('../pushPermissionStorage', () => ({
  hasPromptedForPushPermission: mocks.hasPrompted,
  markPromptedForPushPermission: mocks.markPrompted,
}));
vi.mock('../notificationClient', () => ({
  requestPushPermission: mocks.requestPushPermission,
  currentDevicePlatform: mocks.currentDevicePlatform,
  ensureAndroidNotificationChannel: mocks.ensureAndroidNotificationChannel,
  getExpoPushToken: mocks.getExpoPushToken,
}));
vi.mock('../../analytics/analytics', () => ({
  trackEvent: mocks.trackEvent,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.markPrompted.mockResolvedValue(undefined);
  mocks.ensureAndroidNotificationChannel.mockResolvedValue(undefined);
});

describe('requestPushPermissionAndRegister', () => {
  it('is a no-op once the user has already been prompted this install', async () => {
    mocks.hasPrompted.mockResolvedValue(true);
    const registerPushToken = vi.fn();

    await requestPushPermissionAndRegister(registerPushToken);

    expect(mocks.requestPushPermission).not.toHaveBeenCalled();
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('marks prompted and tracks denial without registering a token when permission is denied', async () => {
    mocks.hasPrompted.mockResolvedValue(false);
    mocks.requestPushPermission.mockResolvedValue('denied');
    const registerPushToken = vi.fn();

    await requestPushPermissionAndRegister(registerPushToken);

    expect(mocks.markPrompted).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent).toHaveBeenCalledWith('push_permission_denied');
    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('registers the device token when permission is granted and a token is available', async () => {
    mocks.hasPrompted.mockResolvedValue(false);
    mocks.requestPushPermission.mockResolvedValue('granted');
    mocks.currentDevicePlatform.mockReturnValue('ios');
    mocks.getExpoPushToken.mockResolvedValue('ExponentPushToken[xyz]');
    const registerPushToken = vi.fn().mockResolvedValue(undefined);

    await requestPushPermissionAndRegister(registerPushToken);

    expect(mocks.trackEvent).toHaveBeenCalledWith('push_permission_granted');
    expect(registerPushToken).toHaveBeenCalledWith({
      token: 'ExponentPushToken[xyz]',
      platform: 'ios',
    });
  });

  it('does not register when granted but no token could be obtained (e.g. missing push credentials)', async () => {
    mocks.hasPrompted.mockResolvedValue(false);
    mocks.requestPushPermission.mockResolvedValue('granted');
    mocks.currentDevicePlatform.mockReturnValue('ios');
    mocks.getExpoPushToken.mockResolvedValue(null);
    const registerPushToken = vi.fn();

    await requestPushPermissionAndRegister(registerPushToken);

    expect(registerPushToken).not.toHaveBeenCalled();
  });

  it('swallows a registerPushToken failure without throwing', async () => {
    mocks.hasPrompted.mockResolvedValue(false);
    mocks.requestPushPermission.mockResolvedValue('granted');
    mocks.currentDevicePlatform.mockReturnValue('android');
    mocks.getExpoPushToken.mockResolvedValue('ExponentPushToken[abc]');
    const registerPushToken = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(requestPushPermissionAndRegister(registerPushToken)).resolves.toBeUndefined();
  });
});
