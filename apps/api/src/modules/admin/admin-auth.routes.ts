import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { adminLoginSchema } from '@vaya/validation';
import { getDatabase } from '../../lib/database.js';
import { loginAdmin } from './admin-auth.service.js';

const loginResponseSchema = z.object({
  accessToken: z.string(),
  admin: z.object({
    id: z.string().uuid(),
    email: z.string(),
    fullName: z.string(),
    role: z.enum(['admin', 'superadmin']),
  }),
});

export async function adminAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const db = getDatabase();

  // Unauthenticated — the login endpoint itself. Rate-limited tighter than
  // the global default (100/min) since this is a credential-guessing
  // surface, mirroring auth.routes.ts's OTP-request precedent.
  app.post(
    '/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { body: adminLoginSchema, response: { 200: loginResponseSchema } },
    },
    async (request, reply) => {
      const admin = await loginAdmin(db, request.body);
      const accessToken = app.jwt.sign(
        { sub: admin.id, type: 'admin', role: admin.role },
        { expiresIn: '12h' },
      );
      reply.send({
        accessToken,
        admin: { id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role },
      });
    },
  );
}
