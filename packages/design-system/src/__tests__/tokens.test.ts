import { describe, it, expect } from 'vitest';
import { colors, spacing, radii, typography } from '../tokens/index.js';

describe('Design tokens', () => {
  describe('colors', () => {
    it('has primary color', () => {
      expect(colors.primary).toBeDefined();
      expect(typeof colors.primary).toBe('string');
    });

    it('has all neutral gray shades', () => {
      expect(colors.gray100).toBeDefined();
      expect(colors.gray500).toBeDefined();
      expect(colors.gray900).toBeDefined();
    });

    it('has semantic colors', () => {
      expect(colors.success).toBeDefined();
      expect(colors.warning).toBeDefined();
      expect(colors.error).toBeDefined();
      expect(colors.info).toBeDefined();
    });
  });

  describe('spacing', () => {
    it('has consistent spacing scale', () => {
      expect(spacing.none).toBe(0);
      expect(spacing.xs).toBe(4);
      expect(spacing.sm).toBe(8);
      expect(spacing.md).toBe(12);
      expect(spacing.lg).toBe(16);
    });
  });

  describe('radii', () => {
    it('has border radius tokens', () => {
      expect(radii.none).toBe(0);
      expect(radii.full).toBe(9999);
    });
  });

  describe('typography', () => {
    it('has font size scale', () => {
      expect(typography.fontSize.xs).toBe(12);
      expect(typography.fontSize.md).toBe(16);
      expect(typography.fontSize['4xl']).toBe(36);
    });

    it('has font weight tokens', () => {
      expect(typography.fontWeight.regular).toBe('400');
      expect(typography.fontWeight.bold).toBe('700');
    });
  });
});
