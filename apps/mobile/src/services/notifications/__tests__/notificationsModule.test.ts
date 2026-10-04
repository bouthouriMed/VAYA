import { describe, it, expect, vi, beforeEach } from 'vitest';

const env = vi.hoisted(() => ({ os: 'android', expoGo: true }));

vi.mock('expo', () => ({ isRunningInExpoGo: () => env.expoGo }));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return env.os;
    },
  },
}));

async function load() {
  vi.resetModules();
  return import('../notificationsModule');
}

/**
 * Regression: importing expo-notifications in Expo Go on Android (SDK 53+)
 * throws at app start ("Android Push notifications ... was removed from
 * Expo Go"), crashing the whole app from app/_layout.tsx.
 */
describe('loadNotifications', () => {
  beforeEach(() => {
    env.os = 'android';
    env.expoGo = true;
  });

  it('never loads expo-notifications in Expo Go on Android', async () => {
    const mod = await load();
    expect(mod.pushUnavailableInThisClient).toBe(true);
    expect(mod.loadNotifications()).toBeNull();
  });

  it('treats a development/standalone Android build as push-capable', async () => {
    env.expoGo = false;
    const mod = await load();
    expect(mod.pushUnavailableInThisClient).toBe(false);
  });

  it('treats iOS Expo Go as push-capable', async () => {
    env.os = 'ios';
    const mod = await load();
    expect(mod.pushUnavailableInThisClient).toBe(false);
  });
});
