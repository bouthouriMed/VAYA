import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../app.js';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, adminUsers, auditLogs, notifications } from '../../../db/schema/index.js';
import { hashPassword } from '../../../lib/password.js';
import { closeQueue } from '../../../lib/queue.js';

/**
 * Admin verification workflow (docs/domain/verification-workflow.md), real
 * Postgres, through the actual HTTP layer (app.inject) exactly like
 * rides-pricing.integration.test.ts — proves the whole review queue end to
 * end: login issues a real admin-scoped JWT, that token can't touch consumer
 * endpoints and vice versa, approve/decline actually flip
 * driver_profiles.verificationStatus, and every mutation writes a real
 * audit_logs row.
 */
describe('Admin verification workflow (HTTP)', () => {
  let app: FastifyInstance;
  const db = getDatabase();
  let adminUserId: string;
  let adminAccessToken: string;
  let driverUserId: string;
  let driverProfileId: string;
  let consumerAccessToken: string;

  beforeAll(async () => {
    app = await buildApp();
    const base = Date.now() % 10_000_000;

    const [adminUser] = await db
      .insert(adminUsers)
      .values({
        email: `admin-test-${base}@vaya.tn`,
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
    expect(loginRes.statusCode).toBe(200);
    adminAccessToken = loginRes.json().accessToken;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}3`, fullName: 'Verification Test Driver' })
      .returning();
    driverUserId = driverUser!.id;
    consumerAccessToken = app.jwt.sign({ sub: driverUserId });

    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId, verificationStatus: 'pending', verificationSubmittedAt: new Date() })
      .returning();
    driverProfileId = driverProfile!.id;
  }, 30_000);

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.adminUserId, adminUserId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await db.delete(adminUsers).where(eq(adminUsers.id, adminUserId));
    await app.close();
    await closeQueue();
    await closeDatabase();
  });

  it('rejects login with a wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/login',
      payload: { email: `admin-test-doesnotexist@vaya.tn`, password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a consumer token on an admin-only endpoint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/verifications',
      headers: { authorization: `Bearer ${consumerAccessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects an admin token on a consumer-only endpoint', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/drivers/me',
      headers: { authorization: `Bearer ${adminAccessToken}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('lists the pending driver in the verification queue', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/verifications?status=pending',
      headers: { authorization: `Bearer ${adminAccessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.some((item: { id: string }) => item.id === driverProfileId)).toBe(true);
  });

  it('declines with resubmission_required, notifies the driver, and writes an audit log', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/verifications/${driverProfileId}/decline`,
      headers: { authorization: `Bearer ${adminAccessToken}` },
      payload: {
        outcome: 'resubmission_required',
        reason: 'document_unclear',
        message: 'Le permis est flou, merci de le soumettre à nouveau.',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().verificationStatus).toBe('resubmission_required');

    const profile = await db.query.driverProfiles.findFirst({ where: eq(driverProfiles.id, driverProfileId) });
    expect(profile?.verificationStatus).toBe('resubmission_required');
    expect(profile?.verificationDeclineReason).toBe('document_unclear');

    const notif = await db.query.notifications.findFirst({
      where: eq(notifications.userId, driverUserId),
      orderBy: (n, { desc }) => desc(n.createdAt),
    });
    expect(notif?.type).toBe('verification_resubmission_required');

    const log = await db.query.auditLogs.findFirst({
      where: eq(auditLogs.targetId, driverProfileId),
      orderBy: (l, { desc }) => desc(l.createdAt),
    });
    expect(log?.action).toBe('VERIFICATION_RESUBMISSION_REQUESTED');
    expect(log?.adminUserId).toBe(adminUserId);
  });

  it('driver can resubmit after resubmission_required, returning to pending', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/drivers/verification/resubmit',
      headers: { authorization: `Bearer ${consumerAccessToken}` },
      payload: { documents: [{ type: 'license', fileUrl: 'https://example.com/license2.jpg' }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().verificationStatus).toBe('pending');
    expect(res.json().verificationAttempt).toBe(2);
  });

  it('approves the verification and updates status/audit log', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/verifications/${driverProfileId}/approve`,
      headers: { authorization: `Bearer ${adminAccessToken}` },
      payload: { notes: 'Looks good now' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().verificationStatus).toBe('approved');

    const log = await db.query.auditLogs.findFirst({
      where: eq(auditLogs.targetId, driverProfileId),
      orderBy: (l, { desc }) => desc(l.createdAt),
    });
    expect(log?.action).toBe('VERIFICATION_APPROVED');
  });

  it('rejects re-approving an already-approved (terminal) verification', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/verifications/${driverProfileId}/approve`,
      headers: { authorization: `Bearer ${adminAccessToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
  });
});
