import pino from 'pino';
import { getEnv } from './env.js';

let _logger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (!_logger) {
    const env = getEnv();
    _logger = pino({
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    });
  }
  return _logger;
}
