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
  // surface, mirroring auth.routes.ts's OTP-request precedent. Keyed by
  // email (not the default req.ip, which is spoofable via a client-supplied
  // X-Forwarded-For under app.ts's `trustProxy: true`) so a password-guessing
  // attempt against one admin account can't reset its budget by rotating IP.
  app.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (request) => (request.body as { email?: string })?.email ?? request.ip,
        },
      },
      schema: { body: adminLoginSchema, response: { 200: loginResponseSchema } },
    },
    async (request, reply) => {
      const admin = await loginAdmin(db, request.body);
      // Shortened from 12h to 4h (2026-09-10 production-readiness pass):
      // apps/admin currently stores this token in localStorage (see
      // apps/admin/src/api/client.ts), which an XSS in the admin SPA could
      // read directly — a shorter window is the safe, verifiable mitigation
      // this pass could make without blind-testing an httpOnly-cookie
      // migration against a live server (recommended next step — see
      // LAUNCH_ACTIONS.md — genuinely fixes the exposure but needs the
      // login round-trip actually exercised against a real DB to verify).
      const accessToken = app.jwt.sign(
        { sub: admin.id, type: 'admin', role: admin.role },
        { expiresIn: '4h' },
      );
      reply.send({
        accessToken,
        admin: { id: admin.id, email: admin.email, fullName: admin.fullName, role: admin.role },
      });
    },
  );
}
