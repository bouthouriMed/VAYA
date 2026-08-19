import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnv } from '../config/env.js';
import { getLogger } from '../config/logger.js';
import * as schema from '../db/schema/index.js';

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDatabase() {
  if (!_db) {
    const env = getEnv();
    _pool = new Pool({ connectionString: env.DATABASE_URL });
    _db = drizzle(_pool, { schema });
    getLogger().info('Database connection established');
  }
  return _db;
}

export async function closeDatabase(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
    getLogger().info('Database connection closed');
  }
}
