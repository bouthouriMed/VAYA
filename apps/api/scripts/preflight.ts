/**
 * Run this against a real target environment's env vars BEFORE deploying a
 * new revision — `pnpm --filter @vaya/api preflight` (with the target
 * environment's real DATABASE_URL/REDIS_URL/etc actually exported into the
 * shell, e.g. via your deploy pipeline's secret injection).
 *
 * `config/env.ts`'s `assertProductionSafe()` already runs at every boot and
 * catches missing/insecure config — but it can't reach out to the network,
 * so it can't tell you a Twilio credential is *present but wrong*, or that
 * DATABASE_URL points at a host that's actually unreachable from this
 * network. This script does the checks that need a real connection attempt,
 * on demand, before a deploy — not on every boot (a slow/flaky external
 * check has no business blocking a routine restart).
 *
 * Exits 1 on any hard failure. Soft/best-effort checks (OSRM, Sentry DSN
 * shape) print a warning but don't fail the run.
 */
import { Pool } from 'pg';
import Redis from 'ioredis';
import { getEnv } from '../src/config/env.js';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function checkDatabase(): Promise<CheckResult> {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  try {
    await withTimeout(pool.query('SELECT 1'), 5000, 'Database connection');
    return { name: 'Database (DATABASE_URL)', ok: true, detail: 'reachable' };
  } catch (err) {
    return { name: 'Database (DATABASE_URL)', ok: false, detail: String(err) };
  } finally {
    await pool.end().catch(() => {});
  }
}

async function checkRedis(): Promise<CheckResult> {
  const env = getEnv();
  if (!env.REDIS_URL) {
    return { name: 'Redis (REDIS_URL)', ok: true, detail: 'not configured — caching/queue/rate-limit backing disabled (acceptable, but confirm this is intentional)' };
  }
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true, connectTimeout: 5000 });
  try {
    await withTimeout(redis.connect(), 5000, 'Redis connection');
    await redis.ping();
    return { name: 'Redis (REDIS_URL)', ok: true, detail: 'reachable' };
  } catch (err) {
    return { name: 'Redis (REDIS_URL)', ok: false, detail: String(err) };
  } finally {
    redis.disconnect();
  }
}

async function checkTwilio(): Promise<CheckResult> {
  const env = getEnv();
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    return { name: 'Twilio credentials', ok: false, detail: 'TWILIO_ACCOUNT_SID/AUTH_TOKEN not set — required in production, OTP sign-in will not work' };
  }
  try {
    const response = await withTimeout(
      fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}.json`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        },
      }),
      8000,
      'Twilio credential check',
    );
    if (!response.ok) {
      return { name: 'Twilio credentials', ok: false, detail: `Twilio rejected these credentials (HTTP ${response.status}) — check TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN` };
    }
    return { name: 'Twilio credentials', ok: true, detail: 'verified against Twilio API' };
  } catch (err) {
    return { name: 'Twilio credentials', ok: false, detail: `Could not reach Twilio to verify: ${String(err)}` };
  }
}

async function checkS3(): Promise<CheckResult> {
  const env = getEnv();
  if (!env.S3_BUCKET || !env.S3_REGION || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
    return { name: 'S3 storage', ok: false, detail: 'S3_BUCKET/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY not fully set — required in production, KYC documents will be lost on container restart' };
  }
  try {
    const { S3Client, HeadBucketCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: env.S3_REGION,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: env.S3_FORCE_PATH_STYLE ?? true } : {}),
    });
    await withTimeout(client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET })), 8000, 'S3 bucket check');
    return { name: 'S3 storage', ok: true, detail: `bucket "${env.S3_BUCKET}" reachable and accessible` };
  } catch (err) {
    return { name: 'S3 storage', ok: false, detail: `Could not access bucket "${env.S3_BUCKET}": ${String(err)}` };
  }
}

function checkSentry(): CheckResult {
  const env = getEnv();
  if (!env.SENTRY_DSN) {
    return { name: 'Sentry DSN', ok: true, detail: 'not configured — unhandled exceptions will only be logged, never reported (recommended, not required)' };
  }
  try {
    const url = new URL(env.SENTRY_DSN);
    if (!url.username || !/^https?:$/.test(url.protocol)) throw new Error('malformed');
    return { name: 'Sentry DSN', ok: true, detail: 'looks well-formed' };
  } catch {
    return { name: 'Sentry DSN', ok: false, detail: 'SENTRY_DSN does not look like a valid Sentry DSN URL' };
  }
}

async function checkOsrm(): Promise<CheckResult> {
  const env = getEnv();
  try {
    const response = await withTimeout(fetch(env.OSRM_URL), 3000, 'OSRM check');
    return { name: 'OSRM (OSRM_URL)', ok: true, detail: `reachable (HTTP ${response.status})` };
  } catch {
    return {
      name: 'OSRM (OSRM_URL)',
      ok: true,
      detail: 'unreachable — non-fatal, only affects stop-candidate generation quality; the app falls back to Google Routes/haversine for everything else',
    };
  }
}

async function main(): Promise<void> {
  const env = getEnv();
  console.log(`Preflight check — NODE_ENV=${env.NODE_ENV}\n`);

  const results = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkTwilio(),
    checkS3(),
    Promise.resolve(checkSentry()),
    checkOsrm(),
  ]);

  let hasFailure = false;
  for (const result of results) {
    const icon = result.ok ? '✓' : '✗';
    console.log(`${icon} ${result.name}: ${result.detail}`);
    if (!result.ok) hasFailure = true;
  }

  console.log('');
  if (hasFailure) {
    console.error('✗ Preflight FAILED — do not deploy until every ✗ above is resolved.');
    process.exit(1);
  }
  console.log('✓ Preflight passed.');
}

main().catch((err) => {
  console.error('Preflight check crashed:', err);
  process.exit(1);
});
