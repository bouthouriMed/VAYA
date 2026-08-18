import { describe, it, expect } from 'vitest';
import type { paths, components } from '../index.js';

describe('API client types', () => {
  it('exports path types', () => {
    type HealthPath = paths['/api/v1/health'];
    expectTypeOf<HealthPath>().toBeDefined();
  });

  it('exports schema types', () => {
    type HealthResponse = components['schemas']['HealthResponse'];
    const mockResponse: HealthResponse = {
      status: 'ok',
      version: '0.1.0',
      environment: 'development',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'healthy', latencyMs: 5 },
      },
    };
    expect(mockResponse.status).toBe('ok');
  });
});
