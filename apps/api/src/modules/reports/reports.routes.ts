import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { createReportSchema } from '@vaya/validation';
import { getDatabase } from '../../lib/database.js';
import { getUserId } from '../../lib/auth-context.js';
import { createReport } from './reports.service.js';

const reportResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['open', 'investigating', 'resolved', 'dismissed']),
  createdAt: z.date(),
});

export async function reportsRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  app.post(
    '/reports',
    {
      onRequest: [fastify.authenticate],
      schema: { body: createReportSchema, response: { 200: reportResponseSchema } },
    },
    async (request, reply) => {
      const report = await createReport(db, getUserId(request), request.body);
      reply.send(report);
    },
  );
}
