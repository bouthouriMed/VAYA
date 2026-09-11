import { describe, it, expect } from 'vitest';
import { sanitizeAppRedirectUri } from '../google-auth.routes.js';

const DEFAULT_APP_DEEP_LINK = 'vaya://auth/google';

// Pure-function coverage for the OAuth redirect-scheme allowlist — no DB/
// network needed. Guards against the exact regression this check exists to
// prevent: handing the one-time OAuth ticket to an arbitrary caller-supplied
// redirect target (another app registering a colliding custom scheme).
describe('sanitizeAppRedirectUri', () => {
  it('accepts the real production/standalone scheme', () => {
    expect(sanitizeAppRedirectUri('vaya://auth/google')).toBe('vaya://auth/google');
  });

  it('accepts Expo Go dev URLs (dynamic host:port)', () => {
    expect(sanitizeAppRedirectUri('exp://192.168.1.10:8081/--/auth/google')).toBe(
      'exp://192.168.1.10:8081/--/auth/google',
    );
  });

  it('accepts a custom dev-client scheme', () => {
    expect(sanitizeAppRedirectUri('exp+vaya://auth/google')).toBe('exp+vaya://auth/google');
  });

  it('rejects http(s) — never bounce a ticket to a web page', () => {
    expect(sanitizeAppRedirectUri('https://attacker.example.com/steal')).toBe(DEFAULT_APP_DEEP_LINK);
    expect(sanitizeAppRedirectUri('http://attacker.example.com/steal')).toBe(DEFAULT_APP_DEEP_LINK);
  });

  it('rejects an arbitrary/unregistered custom scheme (scheme-collision hijack)', () => {
    expect(sanitizeAppRedirectUri('evil-app://intercept')).toBe(DEFAULT_APP_DEEP_LINK);
  });

  it('rejects a scheme that merely contains an allowed one as a substring', () => {
    expect(sanitizeAppRedirectUri('notvaya://auth/google')).toBe(DEFAULT_APP_DEEP_LINK);
    expect(sanitizeAppRedirectUri('javascript:vaya://x')).toBe(DEFAULT_APP_DEEP_LINK);
  });

  it('falls back to the default for non-string/empty input', () => {
    expect(sanitizeAppRedirectUri(undefined)).toBe(DEFAULT_APP_DEEP_LINK);
    expect(sanitizeAppRedirectUri(null)).toBe(DEFAULT_APP_DEEP_LINK);
    expect(sanitizeAppRedirectUri('')).toBe(DEFAULT_APP_DEEP_LINK);
    expect(sanitizeAppRedirectUri(42)).toBe(DEFAULT_APP_DEEP_LINK);
  });
});
