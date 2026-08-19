import { describe, it, expect } from 'vitest';
import { paginationSchema, idParamSchema } from '../index';

describe('Shared validation schemas', () => {
  describe('paginationSchema', () => {
    it('defaults to page 1, limit 20', () => {
      const result = paginationSchema.parse({});
      expect(result).toEqual({ page: 1, limit: 20 });
    });

    it('parses valid pagination', () => {
      const result = paginationSchema.parse({ page: '2', limit: '10' });
      expect(result).toEqual({ page: 2, limit: 10 });
    });

    it('rejects limit > 100', () => {
      expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
    });

    it('rejects page < 1', () => {
      expect(() => paginationSchema.parse({ page: 0 })).toThrow();
    });
  });

  describe('idParamSchema', () => {
    it('validates UUID', () => {
      const id = '550e8400-e29b-41d4-a716-446655440000';
      const result = idParamSchema.parse({ id });
      expect(result.id).toBe(id);
    });

    it('rejects invalid UUID', () => {
      expect(() => idParamSchema.parse({ id: 'not-a-uuid' })).toThrow();
    });
  });
});
