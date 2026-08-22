import { randomBytes, randomInt, createHash } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { OAuth2Client } from 'google-auth-library';
import type { getDatabase } from '../../lib/database.js';
import { oauthLoginTickets, otpCodes, refreshTokens, users } from '../../db/schema/index.js';
import { AppError, UnauthorizedError } from '../../lib/errors.js';
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

export async function requestOtp(db: Database, phone: string): Promise<{ code: string }> {
  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  await db.insert(otpCodes).values({ phone, code, expiresAt });
  await getSmsProvider().sendOtp(phone, code);
  return { code };
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

/** Shared by sign-in (verifyOtpAndIssueTokens) and attaching a phone to an
 *  already-authenticated user (users.service.ts's attachPhoneToUser) —
 *  the code-validity check and single-use consumption are identical in
 *  both cases; only what happens *after* a valid code differs. */
export async function consumeValidOtp(db: Database, phone: string, code: string): Promise<void> {
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
}

export async function verifyOtpAndIssueTokens(
  db: Database,
  phone: string,
  code: string,
  signAccessToken: (userId: string) => string,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  await consumeValidOtp(db, phone, code);
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

interface GoogleProfile {
  googleId: string;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * Confidential-client Authorization Code exchange, done server-side with the
 * client secret (never shipped to the mobile app). Verifying the returned
 * id_token (not just trusting the token endpoint's 200) is what actually
 * proves the profile came from Google for this exact client id.
 */
async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_CALLBACK_URL) {
    throw new AppError('Google sign-in is not configured', 501, 'GOOGLE_AUTH_NOT_CONFIGURED');
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    throw new UnauthorizedError('Google sign-in failed');
  }

  const tokenJson = (await tokenResponse.json()) as { id_token?: string };
  if (!tokenJson.id_token) {
    throw new UnauthorizedError('Google sign-in failed');
  }

  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({
    idToken: tokenJson.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub) {
    throw new UnauthorizedError('Google sign-in failed');
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}

async function findOrCreateGoogleUser(db: Database, profile: GoogleProfile) {
  const existingByGoogleId = await db.query.users.findFirst({
    where: eq(users.googleId, profile.googleId),
  });
  if (existingByGoogleId) return existingByGoogleId;

  // Link, don't duplicate: a phone/OTP account with the same verified email
  // is the same person signing in through a second door.
  if (profile.email) {
    const existingByEmail = await db.query.users.findFirst({ where: eq(users.email, profile.email) });
    if (existingByEmail) {
      const [linked] = await db
        .update(users)
        .set({ googleId: profile.googleId, updatedAt: new Date() })
        .where(eq(users.id, existingByEmail.id))
        .returning();
      if (!linked) throw new Error('Failed to link Google account');
      return linked;
    }
  }

  const [created] = await db
    .insert(users)
    .values({
      email: profile.email,
      googleId: profile.googleId,
      authProvider: 'google',
      fullName: profile.name?.trim() || 'Utilisateur VAYA',
      avatarUrl: profile.picture,
    })
    .returning();
  if (!created) throw new Error('Failed to create user');
  return created;
}

/** Resolves a Google authorization code to a real user, creating or linking one as needed. */
export async function loginWithGoogleCode(db: Database, code: string): Promise<string> {
  const profile = await exchangeGoogleCode(code);
  const user = await findOrCreateGoogleUser(db, profile);
  return user.id;
}

const OAUTH_TICKET_TTL_MS = 2 * 60_000;

/**
 * The OAuth callback can only respond with an HTTP redirect (it's a browser
 * navigation, not a fetch from the app), so it hands the app a short-lived,
 * single-use ticket via a deep link instead of session tokens directly —
 * tokens never appear in a URL/redirect history.
 */
export async function issueOauthTicket(db: Database, userId: string): Promise<string> {
  const ticketPlain = randomBytes(32).toString('hex');
  await db.insert(oauthLoginTickets).values({
    userId,
    ticketHash: hashToken(ticketPlain),
    expiresAt: new Date(Date.now() + OAUTH_TICKET_TTL_MS),
  });
  return ticketPlain;
}

export async function consumeOauthTicket(db: Database, ticketPlain: string): Promise<string> {
  const ticketHash = hashToken(ticketPlain);
  const record = await db.query.oauthLoginTickets.findFirst({
    where: and(
      eq(oauthLoginTickets.ticketHash, ticketHash),
      isNull(oauthLoginTickets.consumedAt),
      gt(oauthLoginTickets.expiresAt, new Date()),
    ),
  });

  if (!record) {
    throw new UnauthorizedError('Invalid or expired ticket');
  }

  await db
    .update(oauthLoginTickets)
    .set({ consumedAt: new Date() })
    .where(eq(oauthLoginTickets.id, record.id));

  return record.userId;
}
