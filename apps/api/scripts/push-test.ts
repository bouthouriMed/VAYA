/**
 * End-to-end push-delivery check for one user — answers "is push actually
 * working?" without guessing:
 *
 *   pnpm --filter @vaya/api push:test <user-id | phone | email>
 *   # on the Oracle VM, inside the running API container:
 *   docker compose -f docker/docker-compose.oracle.yml --env-file docker/.env.prod \
 *     exec api pnpm push:test +21612345678
 *
 * 1. Lists the device tokens registered for that user (none → the app never
 *    registered one: permission denied, or the build has no push
 *    credentials — getExpoPushTokenAsync fails before anything reaches us).
 * 2. Sends a test notification straight to Expo (bypassing the queue, so a
 *    stopped worker can't hide the result).
 * 3. Waits, then fetches Expo's delivery *receipts* — this is where the
 *    real APNs/FCM verdict lives (e.g. `InvalidCredentials` = the FCM V1
 *    service-account key / APNs key isn't uploaded to the Expo project).
 */
import { Pool } from 'pg';
import { getEnv } from '../src/config/env.js';
import { sendExpoPushMessages, type ExpoPushTicket } from '../src/modules/notifications/expo-push.js';

const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const RECEIPT_WAIT_MS = 8000;

interface TokenRow {
  token: string;
  platform: string;
  updated_at: Date;
}

async function findTokens(pool: Pool, who: string): Promise<{ userId: string; tokens: TokenRow[] }> {
  const user = await pool.query<{ id: string }>(
    'SELECT id FROM users WHERE id::text = $1 OR phone = $1 OR email = $1 LIMIT 1',
    [who],
  );
  const userId = user.rows[0]?.id;
  if (!userId) throw new Error(`No user found for "${who}" (try the user id, the +216… phone, or the email)`);
  const tokens = await pool.query<TokenRow>(
    'SELECT token, platform, updated_at FROM device_tokens WHERE user_id = $1 ORDER BY updated_at DESC',
    [userId],
  );
  return { userId, tokens: tokens.rows };
}

async function fetchReceipts(ids: string[]): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  const res = await fetch(RECEIPTS_URL, { method: 'POST', headers, body: JSON.stringify({ ids }) });
  const body = (await res.json()) as { data?: Record<string, unknown> };
  return body.data ?? {};
}

async function main(): Promise<void> {
  const who = process.argv[2];
  if (!who) {
    console.error('Usage: pnpm push:test <user-id | phone | email>');
    process.exit(2);
  }

  const pool = new Pool({ connectionString: getEnv().DATABASE_URL });
  try {
    const { userId, tokens } = await findTokens(pool, who);
    console.log(`User ${userId}: ${tokens.length} registered device token(s)`);
    for (const t of tokens) console.log(`  - ${t.platform}  ${t.token}  (updated ${t.updated_at.toISOString()})`);
    if (tokens.length === 0) {
      console.log(
        '\nNo token registered. Open the app signed in as this user on a real build (not Expo Go on Android),\n' +
          'allow notifications, then re-run. If it stays empty, the build is missing push credentials.',
      );
      process.exitCode = 1;
      return;
    }

    let tickets: ExpoPushTicket[];
    try {
      tickets = await sendExpoPushMessages(
        tokens.map((t) => ({
          to: t.token,
          title: 'VAYA',
          body: 'Notification de test — les notifications fonctionnent.',
          data: { type: 'push_test' },
        })),
      );
    } catch (err) {
      console.error('\nExpo rejected the send:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
      return;
    }

    console.log('\nTickets (accepted by Expo?):');
    tickets.forEach((t, i) => console.log(`  - ${tokens[i]?.platform}: ${JSON.stringify(t)}`));

    const ids = tickets.flatMap((t) => (t.status === 'ok' && t.id ? [t.id] : []));
    if (ids.length === 0) {
      process.exitCode = 1;
      return;
    }
    console.log(`\nWaiting ${RECEIPT_WAIT_MS / 1000}s for delivery receipts from APNs/FCM…`);
    await new Promise((r) => setTimeout(r, RECEIPT_WAIT_MS));
    const receipts = await fetchReceipts(ids);
    console.log('Receipts (delivered to Apple/Google?):');
    for (const id of ids) console.log(`  - ${id}: ${JSON.stringify(receipts[id] ?? 'not ready yet — re-check in a minute')}`);
    const failed = Object.values(receipts).some((r) => (r as { status?: string }).status === 'error');
    if (failed) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
