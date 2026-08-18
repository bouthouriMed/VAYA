import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';
import { getLogger } from '../config/logger.js';

export function errorHandler(
  error: FastifyError | AppError | Error,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  const logger = getLogger();

  if (error instanceof AppError) {
    logger.warn({ err: error, code: error.code }, error.message);
    reply.status(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        ...(error instanceof AppError && 'details' in error ? { details: error.details } : {}),
      },
    });
    return;
  }

  if ('statusCode' in error && typeof error.statusCode === 'number') {
    logger.warn({ err: error }, error.message);
    reply.status(error.statusCode).send({
      error: {
        code: 'REQUEST_ERROR',
        message: error.message,
      },
    });
    return;
  }

  logger.error({ err: error }, 'Unhandled error');
  reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
