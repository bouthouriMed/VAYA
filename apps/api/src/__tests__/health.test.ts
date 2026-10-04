import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';

describe('Health endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.NODE_ENV = 'test';
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live returns alive', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.status).toBe('alive');
  });

  it('GET /health/ready returns status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/ready',
    });

    expect([200, 503]).toContain(response.statusCode);
    const body = JSON.parse(response.payload);
    expect(body.status).toBeDefined();
  });

  it('GET /health returns health status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect([200, 503]).toContain(response.statusCode);
    const body = JSON.parse(response.payload);
    expect(body.status).toBeDefined();
    expect(body.timestamp).toBeDefined();
    expect(body.checks).toBeDefined();
  });

  it('returns 404 for unknown routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/nonexistent',
    });

    expect(response.statusCode).toBe(404);
  });

  it('API responses are marked no-store (personal/live data must never sit in a device or proxy HTTP cache)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health/live' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('public uploads (random, never-rewritten filenames) are cacheable for a year', async () => {
    const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(process.cwd(), 'uploads');
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'cache-header-test.txt');
    writeFileSync(file, 'x');
    try {
      const response = await app.inject({ method: 'GET', url: '/uploads/cache-header-test.txt' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toContain('max-age=31536000');
      expect(response.headers['cache-control']).toContain('immutable');
    } finally {
      rmSync(file, { force: true });
    }
  });
});
