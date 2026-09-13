import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { env } from '../lib/env';
import { db } from '../db/client';
import { users, providers } from '../db/schema/index';
import { UnauthorizedError, ForbiddenError } from './errors';
import { getSessionTokenFromRequest, validateSessionToken } from './auth/session';
import { enforceCsrf } from './auth/csrf';

export interface AuthUser {
  id: string;
  phone: string;
  roles: string[];
  isBlocked: boolean;
  providerId?: string;
}

export interface TokenPayload {
  sub: string;
  phone: string;
  roles: string[];
}

const getSecretKey = () => new TextEncoder().encode(env.JWT_SECRET);

/**
 * Creates a signed JWT access token (used for API / test compatibility)
 */
export async function createAuthToken(
  payload: TokenPayload,
  expiresIn: string = '24h'
): Promise<string> {
  return await new SignJWT({ phone: payload.phone, roles: payload.roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecretKey());
}

/**
 * Verifies JWT signature and claims
 */
export async function verifyAuthToken(token: string): Promise<TokenPayload> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedError('Invalid token subject');
    }
    return {
      sub: payload.sub,
      phone: (payload.phone as string) || '',
      roles: (payload.roles as string[]) || [],
    };
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired authentication token');
  }
}

/**
 * Extracts and verifies current user:
 * 1. Primary: Server-Side HttpOnly Session Cookie (`carfix_session`)
 * 2. Fallback / Compatibility: `Authorization: Bearer <token>`
 */
export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  // 1. Check Primary Cookie Session
  const sessionToken = getSessionTokenFromRequest(req);
  if (sessionToken) {
    const sessionUser = await validateSessionToken(sessionToken);
    if (sessionUser) {
      return sessionUser;
    }
  }

  // 2. Fallback to Bearer JWT (API compatibility & automated tests)
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      const tokenPayload = await verifyAuthToken(token);

      // Direct authoritative database lookup
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, tokenPayload.sub));

      if (!user) {
        throw new UnauthorizedError('User account not found');
      }

      if (user.isBlocked) {
        throw new ForbiddenError('Учетная запись пользователя заблокирована');
      }

      let providerId: string | undefined;
      if (user.roles.includes('provider')) {
        const [provider] = await db
          .select({ id: providers.id })
          .from(providers)
          .where(eq(providers.userId, user.id));
        if (provider) {
          providerId = provider.id;
        }
      }

      return {
        id: user.id,
        phone: user.phone,
        roles: user.roles,
        isBlocked: user.isBlocked,
        providerId,
      };
    }
  }

  return null;
}

/**
 * Enforces authentication and optional role-based access control
 */
export async function requireAuth(
  req: NextRequest,
  allowedRoles?: string[]
): Promise<AuthUser> {
  const authUser = await getAuthUser(req);
  if (!authUser) {
    throw new UnauthorizedError('Требуется авторизация для выполнения действия');
  }

  if (authUser.isBlocked) {
    throw new ForbiddenError('Учетная запись пользователя заблокирована');
  }

  // Automatically enforce CSRF origin protection on mutation requests for cookie sessions
  const sessionToken = getSessionTokenFromRequest(req);
  if (sessionToken && !['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) {
    enforceCsrf(req);
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const hasRole = authUser.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole && !authUser.roles.includes('admin')) {
      throw new ForbiddenError('Недостаточно прав для выполнения данной операции');
    }
  }

  return authUser;
}
