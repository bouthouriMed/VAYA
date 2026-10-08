/**
 * End-to-end email-delivery check — answers "why is no email sent?":
 *
 *   pnpm --filter @vaya/api email:test <user-id | phone | email address>
 *   # on the Oracle VM, inside the running API container:
 *   docker compose -f docker/docker-compose.oracle.yml --env-file docker/.env.prod \
 *     exec api pnpm email:test you@example.com
 *
 * Transactional email only goes out when ALL of these hold, and each one
 * fails silently from a user's point of view:
 *  1. RESEND_API_KEY is set (otherwise DevEmailProvider just logs it);
 *  2. EMAIL_FROM uses a domain verified in Resend (otherwise Resend answers
 *     403 and the worker job fails/retries — visible only in worker logs);
 *  3. the recipient user has an email on file (phone/OTP sign-ups have
 *     none unless they signed in with Google), and the event is one of the
 *     templated types (booking requested/accepted/declined/cancelled,
 *     rating received).
 * This script checks each and sends one real test email.
 */
import { Pool } from 'pg';
import { getEnv } from '../src/config/env.js';
import { ResendEmailProvider } from '../src/lib/email/resend-email-provider.js';

async function resolveRecipient(who: string): Promise<string | null> {
  if (who.includes('@')) return who;
  const pool = new Pool({ connectionString: getEnv().DATABASE_URL });
  try {
    const res = await pool.query<{ id: string; email: string | null }>(
      'SELECT id, email FROM users WHERE id::text = $1 OR phone = $1 LIMIT 1',
      [who],
    );
    const user = res.rows[0];
    if (!user) throw new Error(`No user found for "${who}"`);
    console.log(`User ${user.id}: email on file = ${user.email ?? '(none)'}`);
    return user.email;
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const who = process.argv[2];
  if (!who) {
    console.error('Usage: pnpm email:test <user-id | phone | email address>');
    process.exit(2);
  }

  const env = getEnv();
  console.log(`RESEND_API_KEY: ${env.RESEND_API_KEY ? 'set' : 'NOT SET — emails are only logged, never sent'}`);
  console.log(`EMAIL_FROM:     ${env.EMAIL_FROM}`);
  if (!env.RESEND_API_KEY) {
    process.exitCode = 1;
    return;
  }

  const to = await resolveRecipient(who);
  if (!to) {
    console.log(
      '\nThis user has no email address, so they never get notification emails. ' +
        'Only accounts signed in with Google currently have one.',
    );
    process.exitCode = 1;
    return;
  }

  try {
    await new ResendEmailProvider(env.RESEND_API_KEY, env.EMAIL_FROM).sendEmail({
      to,
      subject: 'VAYA — email de test',
      html: '<p>Les emails VAYA fonctionnent.</p>',
      text: 'Les emails VAYA fonctionnent.',
    });
    console.log(`\nAccepted by Resend → ${to}. Check the inbox (and spam).`);
  } catch (err) {
    console.error('\nResend rejected the send:', err instanceof Error ? err.message : err);
    console.error(
      'A 403 "domain is not verified" means EMAIL_FROM\'s domain must be verified at resend.com/domains ' +
        '(or use "VAYA <onboarding@resend.dev>", which can only send to your own Resend account email).',
    );
    process.exitCode = 1;
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
