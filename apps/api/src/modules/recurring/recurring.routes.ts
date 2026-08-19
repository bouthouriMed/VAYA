import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  recurringPatternIdParamSchema,
  updateRecurringPatternSchema,
} from '@vaya/validation';
import { RECURRING_PATTERN_ROLES, RECURRING_PATTERN_STATUSES } from '@vaya/domain';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { listMyRecurringPatterns, updateRecurringPatternStatus } from './recurring.service.js';

const recurringPatternResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(RECURRING_PATTERN_ROLES),
  routeId: z.string().uuid().nullable(),
  originLabel: z.string(),
  originLat: z.number(),
  originLng: z.number(),
  destinationLabel: z.string(),
  destinationLat: z.number(),
  destinationLng: z.number(),
  daysOfWeekMask: z.number(),
  timeWindowStart: z.string(),
  timeWindowEnd: z.string(),
  confidenceScore: z.number(),
  status: z.enum(RECURRING_PATTERN_STATUSES),
  lastMatchedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  // Phase 11 additions — computed, not stored columns. See
  // recurring.service.ts's listMyRecurringPatterns doc comment.
  matchesToday: z.boolean(),
  todayRideId: z.string().uuid().nullable(),
});

export async function recurringRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  app.get(
    '/recurring-patterns',
    {
      onRequest: [fastify.authenticate],
      schema: { response: { 200: z.array(recurringPatternResponseSchema) } },
    },
    async (request, reply) => {
      const patterns = await listMyRecurringPatterns(db, getUserId(request));
      reply.send(patterns);
    },
  );

  app.patch(
    '/recurring-patterns/:patternId',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: recurringPatternIdParamSchema,
        body: updateRecurringPatternSchema,
        response: {
          200: recurringPatternResponseSchema.omit({ matchesToday: true, todayRideId: true }),
        },
      },
    },
    async (request, reply) => {
      const pattern = await updateRecurringPatternStatus(
        db,
        request.params.patternId,
        getUserId(request),
        request.body,
      );
      reply.send(pattern);
    },
  );
}
