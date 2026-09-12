import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { env } from '../lib/env';
import { db } from '../db/client';
import { users, providers } from '../db/schema/index';
import { UnauthorizedError, ForbiddenError } from './errors';

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
 * Creates a signed JWT access token for authentication
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

interface AuthUserCacheEntry {
  user: AuthUser;
  cachedAt: number;
}

const authUserCache = new Map<string, AuthUserCacheEntry>();
const AUTH_CACHE_TTL_MS = 30 * 1000; // 30 seconds TTL

export function invalidateAuthUserCache(userId?: string) {
  if (userId) {
    for (const [key, entry] of authUserCache.entries()) {
      if (entry.user.id === userId) {
        authUserCache.delete(key);
      }
    }
  } else {
    authUserCache.clear();
  }
}

/**
 * Extracts and verifies current user from Authorization: Bearer <token>
 */
export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return null;
  }

  const cached = authUserCache.get(token);
  if (cached && Date.now() - cached.cachedAt < AUTH_CACHE_TTL_MS) {
    if (cached.user.isBlocked) {
      throw new ForbiddenError('User account is blocked');
    }
    return cached.user;
  }

  const tokenPayload = await verifyAuthToken(token);

  // Look up authoritative user in DB
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, tokenPayload.sub));

  if (!user) {
    throw new UnauthorizedError('User account not found');
  }

  if (user.isBlocked) {
    throw new ForbiddenError('User account is blocked');
  }

  // Check provider profile if user has provider role
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

  const authUser: AuthUser = {
    id: user.id,
    phone: user.phone,
    roles: user.roles,
    isBlocked: user.isBlocked,
    providerId,
  };

  authUserCache.set(token, { user: authUser, cachedAt: Date.now() });

  return authUser;
}

/**
 * Enforces authentication and optional role-based access control
 */
export async function requireAuth(
  req: NextRequest,
  allowedRoles?: string[]
): Promise<AuthUser> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication required: Bearer token missing');
  }

  const authUser = await getAuthUser(req);
  if (!authUser) {
    throw new UnauthorizedError('Authentication failed');
  }

  if (authUser.isBlocked) {
    throw new ForbiddenError('User account is blocked');
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const hasRole = authUser.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole && !authUser.roles.includes('admin')) {
      throw new ForbiddenError('Insufficient permissions for this operation');
    }
  }

  return authUser;
}
