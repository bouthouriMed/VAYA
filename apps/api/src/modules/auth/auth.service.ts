import { randomBytes, randomInt, createHash } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { otpCodes, refreshTokens, users } from '../../db/schema/index.js';
import { UnauthorizedError } from '../../lib/errors.js';
import { getSmsProvider } from '../../lib/sms/index.js';
import { getEnv } from '../../config/env.js';

type Database = ReturnType<typeof getDatabase>;

const OTP_TTL_MINUTES = 5;

function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function requestOtp(db: Database, phone: string): Promise<void> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  await db.insert(otpCodes).values({ phone, code, expiresAt });
  await getSmsProvider().sendOtp(phone, code);
}

async function findOrCreateUser(db: Database, phone: string) {
  const existing = await db.query.users.findFirst({ where: eq(users.phone, phone) });
  if (existing) return existing;

  const [created] = await db
    .insert(users)
    .values({ phone, fullName: `Utilisateur ${phone.slice(-4)}` })
    .returning();
  if (!created) throw new Error('Failed to create user');
  return created;
}

export async function verifyOtpAndIssueTokens(
  db: Database,
  phone: string,
  code: string,
  signAccessToken: (userId: string) => string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const candidate = await db.query.otpCodes.findFirst({
    where: and(
      eq(otpCodes.phone, phone),
      eq(otpCodes.code, code),
      isNull(otpCodes.consumedAt),
      gt(otpCodes.expiresAt, new Date()),
    ),
  });

  if (!candidate) {
    throw new UnauthorizedError('Invalid or expired code');
  }

  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, candidate.id));

  const user = await findOrCreateUser(db, phone);
  return issueTokens(db, user.id, signAccessToken);
}

export async function issueTokens(
  db: Database,
  userId: string,
  signAccessToken: (userId: string) => string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const env = getEnv();
  const refreshTokenPlain = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86_400_000);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(refreshTokenPlain),
    expiresAt,
  });

  return {
    accessToken: signAccessToken(userId),
    refreshToken: refreshTokenPlain,
    expiresIn: env.JWT_ACCESS_TTL_SEC,
  };
}

export async function refreshAccessToken(
  db: Database,
  refreshTokenPlain: string,
  signAccessToken: (userId: string) => string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const tokenHash = hashToken(refreshTokenPlain);
  const record = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, tokenHash),
      isNull(refreshTokens.revokedAt),
      gt(refreshTokens.expiresAt, new Date()),
    ),
  });

  if (!record) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const env = getEnv();
  return { accessToken: signAccessToken(record.userId), expiresIn: env.JWT_ACCESS_TTL_SEC };
}

export async function revokeRefreshToken(db: Database, refreshTokenPlain: string): Promise<void> {
  const tokenHash = hashToken(refreshTokenPlain);
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenHash, tokenHash));
}
