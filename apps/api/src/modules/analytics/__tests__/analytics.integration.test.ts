import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app.js';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, adminUsers, analyticsEvents } from '../../../db/schema/index.js';
import { hashPassword } from '../../../lib/password.js';
import { closeQueue } from '../../../lib/queue.js';

/**
 * Search-funnel + missed-demand analytics (CLAUDE.md sections 8/17), real
 * Postgres, through the actual HTTP layer — proves the mobile-facing
 * ingestion endpoint really persists corridor-bucketed rows and that the
 * admin corridor-demand query aggregates them correctly, not just that the
 * pure computeCorridorKey function is correct in isolation (already covered
 * by packages/domain's own unit test).
 */
describe('Analytics ingestion + admin corridor demand (HTTP)', () => {
  let app: FastifyInstance;
  const db = getDatabase();
  let userId: string;
  let accessToken: string;
  let adminUserId: string;
  let adminAccessToken: string;
  const searchId = crypto.randomUUID();

  beforeAll(async () => {
    app = await buildApp();
    const base = Date.now() % 10_000_000;

    const [user] = await db
      .insert(users)
      .values({ phone: `+216${base}0`, fullName: 'Analytics Test User' })
      .returning();
    userId = user!.id;
    accessToken = app.jwt.sign({ sub: userId });

    const [adminUser] = await db
      .insert(adminUsers)
      .values({
        email: `admin-analytics-${base}@vaya.tn`,
        passwordHash: await hashPassword('Test1234!'),
        fullName: 'Test Admin',
        role: 'admin',
      })
      .returning();
    adminUserId = adminUser!.id;
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/login',
      payload: { email: adminUser!.email, password: 'Test1234!' },
    });
    adminAccessToken = loginRes.json().accessToken;
  }, 30_000);

  afterAll(async () => {
    await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(adminUsers).where(eq(adminUsers.id, adminUserId));
    await app.close();
    await closeQueue();
    await closeDatabase();
  });

  it('ingests a batch of search-funnel events for an authenticated user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/events',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        events: [
          {
            eventName: 'search_submitted',
            searchId,
            originLabel: 'Tunis Test Corridor, Tunisie',
            destinationLabel: 'Sousse Test Corridor, Sousse',
            seats: 2,
          },
          {
            eventName: 'search_no_results',
            searchId,
            originLabel: 'Tunis Test Corridor, Tunisie',
            destinationLabel: 'Sousse Test Corridor, Sousse',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);

    const rows = await db.query.analyticsEvents.findMany({ where: eq(analyticsEvents.userId, userId) });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.corridorKey).toBe('tunis test corridor__sousse test corridor');
    expect(rows.every((r) => r.searchId === searchId)).toBe(true);
  });

  it('rejects unauthenticated ingestion', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/analytics/events',
      payload: { events: [{ eventName: 'search_started' }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('surfaces the ingested search as missed demand in the admin corridor-demand endpoint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/corridors?days=1',
      headers: { authorization: `Bearer ${adminAccessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const corridors = res.json() as { corridorKey: string; demand: number; unmetDemand: number }[];
    const ours = corridors.find((c) => c.corridorKey === 'tunis test corridor__sousse test corridor');
    expect(ours).toBeDefined();
    expect(ours!.demand).toBeGreaterThanOrEqual(1);
    expect(ours!.unmetDemand).toBeGreaterThanOrEqual(1);
  });

  it('reflects the search-funnel counts in the admin search-funnel endpoint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/search-funnel?days=1',
      headers: { authorization: `Bearer ${adminAccessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const funnel = res.json() as { eventName: string; count: number }[];
    const submitted = funnel.find((f) => f.eventName === 'search_submitted');
    const noResults = funnel.find((f) => f.eventName === 'search_no_results');
    expect(submitted!.count).toBeGreaterThanOrEqual(1);
    expect(noResults!.count).toBeGreaterThanOrEqual(1);
  });
});
