import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createDriverOnboardingSchema,
  resubmitVerificationSchema,
  updateVehicleSchema,
  idParamSchema,
} from '@vaya/validation';
import { VERIFICATION_DOCUMENT_TYPES, VERIFICATION_STATUSES, VERIFICATION_DECLINE_REASONS } from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import {
  createOnboarding,
  getMyDriverProfile,
  getMyVerificationDocumentFile,
  resubmitVerification,
  updateVehicle,
} from './drivers.service.js';

const vehicleSchema = z.object({
  id: z.string().uuid(),
  driverProfileId: z.string().uuid(),
  make: z.string(),
  model: z.string(),
  color: z.string(),
  plateNumber: z.string(),
  seatCount: z.number(),
  photoUrl: z.string().nullable(),
});

const documentSchema = z.object({
  id: z.string().uuid(),
  driverProfileId: z.string().uuid(),
  type: z.enum(VERIFICATION_DOCUMENT_TYPES),
  fileUrl: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']),
});

const driverProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  verificationStatus: z.enum(VERIFICATION_STATUSES),
  bio: z.string().nullable(),
  ratingAvg: z.number(),
  tripCount: z.number(),
  punctualityScore: z.number(),
  reliabilityScore: z.number(),
  approvedAt: z.date().nullable(),
  verificationDeclineReason: z.enum(VERIFICATION_DECLINE_REASONS).nullable(),
  verificationDeclineMessage: z.string().nullable(),
  verificationAttempt: z.number(),
  vehicles: z.array(vehicleSchema),
  documents: z.array(documentSchema),
});

export async function driversRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  app.post(
    '/drivers/onboarding',
    {
      onRequest: [fastify.authenticate],
      schema: { body: createDriverOnboardingSchema, response: { 200: driverProfileSchema } },
    },
    async (request, reply) => {
      const profile = await createOnboarding(db, getUserId(request), request.body);
      reply.send(profile);
    },
  );

  app.post(
    '/drivers/verification/resubmit',
    {
      onRequest: [fastify.authenticate],
      schema: { body: resubmitVerificationSchema, response: { 200: driverProfileSchema } },
    },
    async (request, reply) => {
      const profile = await resubmitVerification(db, getUserId(request), request.body);
      reply.send(profile);
    },
  );

  app.get(
    '/drivers/me',
    {
      onRequest: [fastify.authenticate],
      schema: { response: { 200: driverProfileSchema } },
    },
    async (request, reply) => {
      const profile = await getMyDriverProfile(db, getUserId(request));
      reply.send(profile);
    },
  );

  // Driver's own preview of a previously-submitted document (resubmission
  // screen's "here's what you sent before") — same secure-storage read path
  // admin review uses (admin.routes.ts's mirror endpoint), gated by
  // ownership instead of authenticateAdmin.
  app.get(
    '/drivers/me/documents/:id/file',
    { onRequest: [fastify.authenticate], schema: { params: idParamSchema } },
    async (request, reply) => {
      const file = await getMyVerificationDocumentFile(db, getUserId(request), request.params.id);
      reply.type(file.contentType).send(file.buffer);
    },
  );

  app.patch(
    '/drivers/vehicle',
    {
      onRequest: [fastify.authenticate],
      schema: { body: updateVehicleSchema, response: { 200: vehicleSchema } },
    },
    async (request, reply) => {
      const vehicle = await updateVehicle(db, getUserId(request), request.body);
      reply.send(vehicle);
    },
  );
}
