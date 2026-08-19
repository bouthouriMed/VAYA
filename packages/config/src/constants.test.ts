import { describe, it, expect } from 'vitest';
import { APP_NAME, SUPPORTED_LOCALES, DEFAULT_LOCALE, TUNISIA_TIMEZONE } from './index';

describe('Config constants', () => {
  it('has app name', () => {
    expect(APP_NAME).toBe('VAYA');
  });

  it('includes French as supported locale', () => {
    expect(SUPPORTED_LOCALES).toContain('fr');
  });

  it('defaults to French', () => {
    expect(DEFAULT_LOCALE).toBe('fr');
  });

  it('has Tunisia timezone', () => {
    expect(TUNISIA_TIMEZONE).toBe('Africa/Tunis');
  });
});
