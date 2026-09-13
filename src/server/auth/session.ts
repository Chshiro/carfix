import crypto from 'node:crypto';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '../../db/client';
import { sessions, users, providers } from '../../db/schema/index';
import { env } from '../../lib/env';
import { AuthUser } from '../auth';
import { ForbiddenError, UnauthorizedError } from '../errors';

export const SESSION_COOKIE_NAME = 'carfix_session';

/**
 * Generates a high-entropy 256-bit random session token (64-char hex)
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Computes SHA-256 hash of a session token for secure database storage
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Creates a new server-side session in the database
 */
export async function createSession(
  userId: string,
  ttlSeconds: number = env.AUTH_SESSION_TTL_SECONDS
): Promise<{ sessionToken: string; expiresAt: Date }> {
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashSessionToken(sessionToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  await db.insert(sessions).values({
    userId,
    sessionTokenHash,
    expiresAt,
    revokedAt: null,
    lastUsedAt: now,
    createdAt: now,
  });

  return { sessionToken, expiresAt };
}

/**
 * Validates a session token, checks revocation, expiration, and user block status.
 * Applies throttled update to last_used_at (only updates if > 5 minutes stale).
 */
export async function validateSessionToken(sessionToken: string): Promise<AuthUser | null> {
  if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.trim().length === 0) {
    return null;
  }

  const tokenHash = hashSessionToken(sessionToken);
  const now = new Date();

  const [sessionRow] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      lastUsedAt: sessions.lastUsedAt,
      userId: users.id,
      phone: users.phone,
      roles: users.roles,
      isBlocked: users.isBlocked,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.sessionTokenHash, tokenHash),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now)
      )
    );

  if (!sessionRow) {
    return null;
  }

  if (sessionRow.isBlocked) {
    throw new ForbiddenError('Учетная запись пользователя заблокирована');
  }

  // Throttled last_used_at update (if older than 5 minutes)
  const fiveMinutesMs = 5 * 60 * 1000;
  if (now.getTime() - new Date(sessionRow.lastUsedAt).getTime() > fiveMinutesMs) {
    // Non-blocking update
    db.update(sessions)
      .set({ lastUsedAt: now })
      .where(eq(sessions.id, sessionRow.sessionId))
      // eslint-disable-next-line no-console
      .catch((err) => console.error('Failed to update session lastUsedAt:', err));
  }


  // Check if provider record exists for user
  let providerId: string | undefined;
  if (sessionRow.roles.includes('provider')) {
    const [provider] = await db
      .select({ id: providers.id })
      .from(providers)
      .where(eq(providers.userId, sessionRow.userId));
    if (provider) {
      providerId = provider.id;
    }
  }

  return {
    id: sessionRow.userId,
    phone: sessionRow.phone,
    roles: sessionRow.roles,
    isBlocked: sessionRow.isBlocked,
    providerId,
  };
}

/**
 * Revokes a single session by session token
 */
export async function revokeSession(sessionToken: string): Promise<void> {
  if (!sessionToken) return;
  const tokenHash = hashSessionToken(sessionToken);
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.sessionTokenHash, tokenHash));
}

/**
 * Revokes all active sessions for a user (e.g. security reset / password change)
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  if (!userId) return;
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/**
 * Extracts session token from incoming request (Cookie first, then fallback)
 */
export function getSessionTokenFromRequest(req: NextRequest | Request): string | null {
  // 1. NextRequest cookies
  if ('cookies' in req && req.cookies && typeof req.cookies.get === 'function') {
    const cookie = req.cookies.get(SESSION_COOKIE_NAME);
    if (cookie?.value) {
      return cookie.value;
    }
  }

  // 2. Raw Cookie header fallback
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [name, ...rest] = cookie.trim().split('=');
      if (name === SESSION_COOKIE_NAME) {
        return decodeURIComponent(rest.join('='));
      }
    }
  }

  return null;
}

/**
 * Generates Set-Cookie header value for authenticated session
 */
export function createSessionCookie(token: string, expiresAt: Date): string {
  const isProd = env.NODE_ENV === 'production';
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  const secureFlag = isProd ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`;
}

/**
 * Generates Set-Cookie header value for clearing/invalidating the session cookie
 */
export function clearSessionCookie(): string {
  const isProd = env.NODE_ENV === 'production';
  const secureFlag = isProd ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureFlag}`;
}
