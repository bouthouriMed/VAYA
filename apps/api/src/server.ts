import http from 'node:http';
import { validateEnv } from './config/env.js';
import { getLogger } from './config/logger.js';
import { closeDatabase } from './lib/database.js';
import { closeRedis } from './lib/redis.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  validateEnv();
  const env = validateEnv();
  const logger = getLogger();

  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    logger.info(`API server running on http://${env.HOST}:${env.PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }

  // Google's redirect target (GOOGLE_CALLBACK_URL) is a fixed, GCP-registered
  // URL this app doesn't control the port of. Rather than moving the whole
  // API to that port (breaking every other hardcoded :3000 reference — the
  // mobile app, e2e tests, docker), bind a second plain http.Server to
  // Fastify's own request router (`app.routing`, its documented way to serve
  // the same route table from more than one listener — a Fastify instance
  // itself can only call `.listen()` once) on GOOGLE_OAUTH_CALLBACK_PORT.
  // Deliberately NOT parsed out of GOOGLE_CALLBACK_URL's own port: that URL
  // may be a public tunnel domain (e.g. https://*.trycloudflare.com, no
  // explicit port — implicitly 443) whose local target is whatever port the
  // tunnel process was pointed at, which has nothing to do with what's in
  // the URL string. Non-fatal: Google sign-in is opt-in, so a bind failure
  // here (e.g. port already in use) shouldn't take the rest of the API down.
  let secondaryServer: http.Server | undefined;
  if (env.GOOGLE_CALLBACK_URL && env.GOOGLE_OAUTH_CALLBACK_PORT !== env.PORT) {
    const callbackPort = env.GOOGLE_OAUTH_CALLBACK_PORT;
    secondaryServer = http.createServer(app.routing);
    secondaryServer.on('error', (err) => {
      logger.warn(
        { err },
        `Failed to bind Google OAuth callback port ${callbackPort} — Google sign-in will not work until this is resolved`,
      );
    });
    secondaryServer.listen(callbackPort, env.HOST, () => {
      logger.info(`Google OAuth callback listener running on http://${env.HOST}:${callbackPort}`);
    });
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    if (secondaryServer) await new Promise((resolve) => secondaryServer!.close(resolve));
    await app.close();
    await closeDatabase();
    await closeRedis();
    logger.info('Server shut down');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
