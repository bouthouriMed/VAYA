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
  listVerificationQueue,
} from './admin-verification.service.js';
import { listReportsForAdmin, updateReportForAdmin } from './admin-reports.service.js';
import { getCorridorDemand, getOverviewMetrics, getSearchFunnel } from './admin-analytics.service.js';
import { listAuditLogs } from './audit-log.service.js';

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

  // --- Users ---
  app.get('/users', { ...adminAuth, schema: { querystring: adminUsersQuerySchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await listUsersForAdmin(db, request.query));
  });
  app.get('/users/:id', { ...adminAuth, schema: { params: idParamSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await getUserDetailForAdmin(db, request.params.id));
  });
  app.post('/users/:id/suspend', { ...adminAuth, schema: { params: idParamSchema, body: suspendUserSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await suspendUser(db, { userId: request.params.id, reason: request.body.reason, adminUserId: getAdminId(request) }));
  });
  app.post('/users/:id/reactivate', { ...adminAuth, schema: { params: idParamSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(await reactivateUser(db, { userId: request.params.id, adminUserId: getAdminId(request) }));
  });
  app.post('/users/:id/restrict-driver', { ...adminAuth, schema: { params: idParamSchema, body: suspendUserSchema, response: { 200: anyResponse } } }, async (request, reply) => {
    reply.send(
      await setDriverPrivilegeRestriction(db, {
        userId: request.params.id,
        restrict: true,
        reason: request.body.reason,
        adminUserId: getAdminId(request),
      }),
    );
  });
  app.post('/users/:id/unrestrict-driver', { ...adminAuth, schema: { params: idParamSchema, response: { 200: anyResponse } } }, async (request, reply) => {
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
}
