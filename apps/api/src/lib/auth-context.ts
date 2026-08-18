import type { FastifyRequest } from 'fastify';

/** Extracts the authenticated user's id. Only valid behind the `authenticate` preHandler. */
export function getUserId(request: FastifyRequest): string {
  return request.user.sub;
}
