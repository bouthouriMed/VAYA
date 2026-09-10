import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  adminAnalyticsQuerySchema,
  adminCancelRideSchema,
  adminReportsQuerySchema,
  adminRidesQuerySchema,
  adminUsersQuerySchema,
  approveVerificationSchema,
  declineVerificationSchema,
  idParamSchema,
  suspendUserSchema,
  updateOperationalConfigSchema,
  updateReportSchema,
  verificationQueueQuerySchema,
} from '@vaya/validation';
import { getDatabase } from '../../lib/database.js';
import {
  getUserDetailForAdmin,
  listUsersForAdmin,
  reactivateUser,
  setDriverPrivilegeRestriction,
  suspendUser,
} from './admin-users.service.js';
import { adminCancelRide, getRideDetailForAdmin, listRidesForAdmin } from './admin-rides.service.js';
import {
  approveVerification,
  declineVerification,
  getVerificationDetail,
  getVerificationDocumentFile,
  listVerificationQueue,
} from './admin-verification.service.js';
import { listReportsForAdmin, updateReportForAdmin } from './admin-reports.service.js';
import { getCorridorDemand, getOverviewMetrics, getSearchFunnel } from './admin-analytics.service.js';
import { listAuditLogs } from './audit-log.service.js';
import {
  getActiveOperationalConfig,
  updateOperationalConfig,
} from '../operational-config/operational-config.service.js';
import { getFailedJobCount, listFailedJobs, retryFailedJob } from './admin-queue.service.js';

// Admin-facing responses are intentionally permissive (z.any()/passthrough
// shapes) rather than the fully-enumerated schemas the consumer-facing API
// uses everywhere else — this surface is internal-only (never called by the
// mobile app or any third party), consumed by apps/admin (built in this
// same change) which can tolerate a superset of fields, and the payloads
// here are wide (nested driver/vehicle/document/booking graphs) enough that
// hand-enumerating every field would be pure duplication of the query
// shape above with no real safety benefit for an internal tool.
const anyResponse = z.any();

function getAdminId(request: { user: { sub: string } }): string {
  return request.user.sub;
}

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();
  const adminAuth = { onRequest: [fastify.authenticateAdmin] };
  const superAdminAuth = { onRequest: [fastify.authenticateSuperAdmin] };

  // --- Users ---
  app.get('/users', { ...adminAuth, schema: { querystring: adminUsersQuerySchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await listUsersForAdmin(db, request.query));
  });
  app.get('/users/:id', { ...adminAuth, schema: { params: idParamSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await getUserDetailForAdmin(db, request.params.id));
  });
  // Account-lifecycle actions (suspend/restrict) have platform-wide blast
  // radius, so they require superadmin, not just any authenticated admin.
  app.post('/users/:id/suspend', { ...superAdminAuth, schema: { params: idParamSchema, body: suspendUserSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await suspendUser(db, { userId: request.params.id, reason: request.body.reason, adminUserId: getAdminId(request) }));
  });
  app.post('/users/:id/reactivate', { ...superAdminAuth, schema: { params: idParamSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await reactivateUser(db, { userId: request.params.id, adminUserId: getAdminId(request) }));
  });
  app.post('/users/:id/restrict-driver', { ...superAdminAuth, schema: { params: idParamSchema, body: suspendUserSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(
      await setDriverPrivilegeRestriction(db, {
        userId: request.params.id,
        restrict: true,
        reason: request.body.reason,
        adminUserId: getAdminId(request),
      }),
    );
  });
  app.post('/users/:id/unrestrict-driver', { ...superAdminAuth, schema: { params: idParamSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(
      await setDriverPrivilegeRestriction(db, { userId: request.params.id, restrict: false, adminUserId: getAdminId(request) }),
    );
  });

  // --- Rides ---
  app.get('/rides', { ...adminAuth, schema: { querystring: adminRidesQuerySchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await listRidesForAdmin(db, request.query));
  });
  app.get('/rides/:id', { ...adminAuth, schema: { params: idParamSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await getRideDetailForAdmin(db, request.params.id));
  });
  app.post('/rides/:id/cancel', { ...adminAuth, schema: { params: idParamSchema, body: adminCancelRideSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await adminCancelRide(db, { rideId: request.params.id, reason: request.body.reason, adminUserId: getAdminId(request) }));
  });

  // --- Driver verification ---
  app.get('/verifications', { ...adminAuth, schema: { querystring: verificationQueueQuerySchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await listVerificationQueue(db, request.query));
  });
  app.get('/verifications/:id', { ...adminAuth, schema: { params: idParamSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await getVerificationDetail(db, request.params.id));
  });
  app.post('/verifications/:id/approve', { ...adminAuth, schema: { params: idParamSchema, body: approveVerificationSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await approveVerification(db, { driverProfileId: request.params.id, adminUserId: getAdminId(request), input: request.body }));
  });
  app.post('/verifications/:id/decline', { ...adminAuth, schema: { params: idParamSchema, body: declineVerificationSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await declineVerification(db, { driverProfileId: request.params.id, adminUserId: getAdminId(request), input: request.body }));
  });
  // Streams the actual document bytes — never a bookmarkable/shareable URL
  // (docs/domain/verification-workflow.md's "Document security" section).
  // idParamSchema's `:id` here is the verification_documents row id, not a
  // driver profile id (unlike every other /verifications/:id route above).
  app.get('/verifications/documents/:id/file', { ...adminAuth, schema: { params: idParamSchema } }, async (request, reply) => {
    const file = await getVerificationDocumentFile(db, request.params.id);
    reply.type(file.contentType).send(file.buffer);
  });

  // --- Reports / safety ---
  app.get('/reports', { ...adminAuth, schema: { querystring: adminReportsQuerySchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await listReportsForAdmin(db, request.query));
  });
  app.patch('/reports/:id', { ...adminAuth, schema: { params: idParamSchema, body: updateReportSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await updateReportForAdmin(db, { reportId: request.params.id, adminUserId: getAdminId(request), input: request.body }));
  });

  // --- Analytics ---
  app.get('/analytics/overview', { ...adminAuth, schema: { querystring: adminAnalyticsQuerySchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await getOverviewMetrics(db, request.query.days));
  });
  app.get('/analytics/corridors', { ...adminAuth, schema: { querystring: adminAnalyticsQuerySchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await getCorridorDemand(db, request.query.days));
  });
  app.get('/analytics/search-funnel', { ...adminAuth, schema: { querystring: adminAnalyticsQuerySchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await getSearchFunnel(db, request.query.days));
  });

  // --- Audit log ---
  app.get('/audit-logs', { ...adminAuth, schema: { response: { 200: anyResponse } } }, async (_request, reply) => {
    reply.send(await listAuditLogs(db));
  });

  // --- Operational policy configuration ---
  // (docs/unified_driver_and_passenger_journey.md §28, M-085/M-086): "The
  // Admin Panel is the authoritative interface for setting and changing
  // these values." Every field always resolved (admin override or
  // packages/domain's own pure default) — never a bare null the admin UI
  // would have to guess a fallback for.
  app.get('/operational-config', { ...adminAuth, schema: { response: { 200: anyResponse } } }, async (_request, reply) => {
    reply.send(await getActiveOperationalConfig(db));
  });
  app.patch(
    '/operational-config',
    { ...superAdminAuth, schema: { body: updateOperationalConfigSchema, response: { 200: anyResponse } } },
    async (request, reply) => {
      reply.send(await updateOperationalConfig(db, request.body, getAdminId(request)));
    },
  );

  // --- Background job visibility (BullMQ dead-letter, apps/api/src/lib/queue.ts) ---
  // Previously the only way to see what's actually failing in the
  // notification-dispatch/recurring-scan/staleness-sweep queue was direct
  // Redis CLI access — this surfaces the same data (BullMQ already retains
  // up to 1000 failed jobs) through the admin API.
  app.get(
    '/queue/failed',
    {
      ...adminAuth,
      schema: {
        querystring: z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }),
        response: { 200: anyResponse },
      },
    },
    async (request, reply) => {
      const [jobs, count] = await Promise.all([
        listFailedJobs(request.query.limit),
        getFailedJobCount(),
      ]);
      reply.send({ jobs, totalFailedCount: count });
    },
  );
  app.post(
    '/queue/failed/:id/retry',
    { ...adminAuth, schema: { params: z.object({ id: z.string() }), response: { 200: anyResponse } } },
    async (request, reply) => {
      await retryFailedJob(request.params.id);
      reply.send({ success: true });
    },
  );
}
