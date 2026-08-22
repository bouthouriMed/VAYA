import { describe, it, expect } from 'vitest';
import { lightPalette, darkPalette } from '../theme/palette';

describe('App theme', () => {
  it('exports the theme provider and hook', async () => {
    const theme = await import('../theme/AppThemeProvider.js');
    expect(theme.AppThemeProvider).toBeDefined();
    expect(theme.useAppTheme).toBeDefined();
  });

  it('light and dark palettes define the same set of roles', () => {
    expect(Object.keys(lightPalette).sort()).toEqual(Object.keys(darkPalette).sort());
  });

  it('light and dark palettes invert background/ink relative to each other', () => {
    expect(lightPalette.background).not.toBe(darkPalette.background);
    expect(lightPalette.ink).not.toBe(darkPalette.ink);
  });
});
