import { test, expect } from '@playwright/test';

test.describe('API Health Checks', () => {
  test('GET /api/v1/health/live returns alive', async ({ request }) => {
    const response = await request.get('/api/v1/health/live');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('alive');
  });

  test('GET /api/v1/health/ready returns status', async ({ request }) => {
    const response = await request.get('/api/v1/health/ready');
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body.status).toBeDefined();
  });

  test('GET /api/v1/health returns comprehensive health', async ({ request }) => {
    const response = await request.get('/api/v1/health');
    expect([200, 503]).toContain(response.status());
    const body = await response.json();
    expect(body.status).toBeDefined();
    expect(body.timestamp).toBeDefined();
    expect(body.checks).toBeDefined();
  });
});
