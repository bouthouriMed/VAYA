/**
 * Sends the in-app notice for a new version of the Terms / Privacy Policy
 * (Terms, article 20) — run ONCE after deploying a change to packages/legal:
 *
 *   pnpm --filter @vaya/api legal:notify            # sends
 *   pnpm --filter @vaya/api legal:notify --dry-run  # counts only
 *   # on the Oracle VM, inside the running API container:
 *   docker compose -f docker/docker-compose.oracle.yml --env-file docker/.env.prod \
 *     exec api pnpm legal:notify
 *
 * Every member who isn't deleted gets one `legal_update` notification (inbox +
 * push when they allow it) for LEGAL_UPDATE.version. Safe to re-run: members
 * who already have the notice for this version are skipped, so a run cut
 * short can simply be started again. The worker must be running to deliver
 * the pushes (the inbox row exists either way).
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { LEGAL_UPDATE, checkLegalUpdate } from '@vaya/legal';
import { getDatabase, closeDatabase } from '../src/lib/database.js';
import { closeQueue } from '../src/lib/queue.js';
import { notifications, users } from '../src/db/schema/index.js';
import { createNotification } from '../src/modules/notifications/notifications.service.js';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const problems = checkLegalUpdate(LEGAL_UPDATE, []);
  if (problems.length > 0) {
    console.error('LEGAL_UPDATE is not valid — fix packages/legal/src/updates.ts first:\n  ' + problems.join('\n  '));
    process.exitCode = 1;
    return;
  }

  const db = getDatabase();
  try {
    const recipients = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          sql`NOT EXISTS (SELECT 1 FROM ${notifications} n WHERE n.user_id = ${users.id} AND n.type = 'legal_update' AND n.payload->>'version' = ${LEGAL_UPDATE.version})`,
        ),
      );

    console.log(
      `Version ${LEGAL_UPDATE.version} (in force ${LEGAL_UPDATE.effectiveOn}${LEGAL_UPDATE.important ? ', important change' : ''}): ${recipients.length} member(s) to notify.`,
    );
    if (dryRun || recipients.length === 0) return;

    let sent = 0;
    const failed: string[] = [];
    for (const { id } of recipients) {
      try {
        await createNotification(db, id, 'legal_update', {
          version: LEGAL_UPDATE.version,
          effectiveOn: LEGAL_UPDATE.effectiveOn,
        });
        sent += 1;
      } catch (err) {
        failed.push(id);
        console.error(`  failed for ${id}:`, err instanceof Error ? err.message : err);
      }
    }
    console.log(`Sent ${sent}. Failed ${failed.length}${failed.length ? ' — re-run to retry them' : ''}.`);
    if (failed.length > 0) process.exitCode = 1;

    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.type, 'legal_update'), sql`${notifications.payload}->>'version' = ${LEGAL_UPDATE.version}`));
    console.log(`Members with the ${LEGAL_UPDATE.version} notice now: ${row?.total ?? 0}.`);
  } finally {
    await closeQueue();
    await closeDatabase();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
