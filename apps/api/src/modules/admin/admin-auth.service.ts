import { eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { adminUsers } from '../../db/schema/index.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { verifyPassword } from '../../lib/password.js';
import type { AdminLoginInput } from '@vaya/validation';

type Database = ReturnType<typeof getDatabase>;

export async function loginAdmin(db: Database, input: AdminLoginInput) {
  const admin = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.email, input.email.toLowerCase()),
  });
  // Deliberately the same error/timing shape whether the email doesn't
  // exist or the password is wrong — never reveal which one it was.
  if (!admin) {
    await verifyPassword(input.password, '0'.repeat(32) + ':' + '0'.repeat(128)); // constant-time-ish decoy
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await verifyPassword(input.password, admin.passwordHash);
  if (!valid) throw new UnauthorizedError('Invalid email or password');

  await db
    .update(adminUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(adminUsers.id, admin.id));

  return admin;
}
