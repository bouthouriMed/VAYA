import { eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { routes } from '../../db/schema/index.js';
import { NotFoundError } from '../../lib/errors.js';

type Database = ReturnType<typeof getDatabase>;

export async function getRouteById(db: Database, routeId: string) {
  const route = await db.query.routes.findFirst({ where: eq(routes.id, routeId) });
  if (!route) throw new NotFoundError('Route');
  return route;
}
