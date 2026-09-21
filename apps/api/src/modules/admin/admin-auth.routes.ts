import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { adminLoginSchema } from '@vaya/validation';
import { getDatabase } from '../../lib/database.js';
import { loginAdmin } from './admin-auth.service.js';
import { RATE_LIMITS, keyedRateLimit } from '../../lib/rate-limit.js';

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
  // The per-email counter is a preHandler (body parsed by then — the old
  // `keyGenerator` reading request.body in onRequest always saw undefined and
  // fell back to the client IP) and keys on the LOWER-CASED, trimmed email:
  // loginAdmin matches case-insensitively, so keying on the raw string let an
  // attacker mint a fresh budget per capitalisation ("A@x", "a@x", "A@X"...)
  // against the same account. A per-IP counter runs alongside it.
  const adminLoginEmailLimit = keyedRateLimit(fastify, {
    namespace: 'admin-login-email',
    ...RATE_LIMITS.adminLoginPerEmail,
    key: (request) => (request.body as { email?: string } | undefined)?.email?.trim().toLowerCase(),
  });

  app.post(
    '/login',
    {
      config: { rateLimit: RATE_LIMITS.adminLoginPerIp },
      preHandler: [adminLoginEmailLimit],
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
