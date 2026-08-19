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

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
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
