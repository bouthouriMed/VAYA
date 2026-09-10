import { describe, it, expect, vi, beforeEach } from 'vitest';

const init = vi.fn();
const captureExceptionMock = vi.fn();

vi.mock('@sentry/react-native', () => ({
  init,
  captureException: captureExceptionMock,
}));

let mockExtra: { sentryDsn: string | null } = { sentryDsn: null };
vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

describe('monitoring/sentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockExtra = { sentryDsn: null };
  });

  it('does not call Sentry.init when no DSN is configured', async () => {
    const { initMonitoring } = await import('../sentry');
    initMonitoring();
    expect(init).not.toHaveBeenCalled();
  });

  it('calls Sentry.init with the configured DSN', async () => {
    mockExtra = { sentryDsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' };
    const { initMonitoring } = await import('../sentry');
    initMonitoring();
    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' }),
    );
  });

  it('captureException is a no-op before initMonitoring is called', async () => {
    const { captureException } = await import('../sentry');
    captureException(new Error('boom'));
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('captureException forwards to Sentry once initialized', async () => {
    mockExtra = { sentryDsn: 'https://examplePublicKey@o0.ingest.sentry.io/0' };
    const { initMonitoring, captureException } = await import('../sentry');
    initMonitoring();
    const error = new Error('boom');
    captureException(error);
    expect(captureExceptionMock).toHaveBeenCalledWith(error);
  });
});
