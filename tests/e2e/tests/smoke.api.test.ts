import { test, expect } from '@playwright/test';

/**
 * Read-only, side-effect-free smoke checks — safe to run against a REAL
 * deployed environment (staging or production) post-deploy, unlike every
 * other suite under tests/e2e (which create real users/bookings/OTP
 * requests and are only meant for a disposable local/CI stack). Nothing
 * here writes data, consumes a rate-limit budget meant for real users, or
 * sends a real SMS/email/push.
 *
 * Usage: `API_BASE_URL=https://api.vaya-app.com npx playwright test smoke --project=api`
 * (see PRODUCTION_READINESS.md's pre-launch checklist / LAUNCH_ACTIONS.md
 * for exactly when to run this — right after every deploy, before
 * declaring it done).
 */
test.describe('Post-deploy smoke checks', () => {
  test('GET /api/v1/health/live returns alive', async ({ request }) => {
    const response = await request.get('/api/v1/health/live');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('alive');
  });

  test('GET /api/v1/health reports every dependency healthy', async ({ request }) => {
    const response = await request.get('/api/v1/health');
    const body = await response.json();
    // Unlike health-check.api.test.ts's tolerant 200/503 check (meant for a
    // possibly-still-booting local stack), a smoke check's whole point is
    // to fail loudly if a just-deployed environment's real DB/Redis aren't
    // actually reachable.
    expect(response.status()).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks.database?.status).toBe('healthy');
  });

  test('GET /api/v1/openapi.json serves a real, populated spec', async ({ request }) => {
    const response = await request.get('/api/v1/openapi.json');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.openapi).toBeDefined();
    expect(Object.keys(body.paths ?? {}).length).toBeGreaterThan(10);
  });

  test('GET /metrics serves real Prometheus output', async ({ request }) => {
    const response = await request.get('/metrics');
    expect(response.ok()).toBeTruthy();
    const body = await response.text();
    expect(body).toContain('http_requests_total');
    expect(body).toContain('process_resident_memory_bytes');
  });

  test('an unauthenticated request to a protected route is rejected, not silently allowed', async ({
    request,
  }) => {
    // A minimal live authorization sanity check — catches a misconfigured
    // deploy (e.g. JWT_SECRET mismatch between replicas) that would
    // otherwise only surface as a confusing 401 flood from real users.
    const response = await request.get('/api/v1/users/me');
    expect(response.status()).toBe(401);
  });

  test('a nonexistent route returns the real 404 handler, not a proxy/gateway error page', async ({
    request,
  }) => {
    const response = await request.get('/api/v1/this-route-does-not-exist');
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error?.code).toBe('NOT_FOUND');
  });
});
