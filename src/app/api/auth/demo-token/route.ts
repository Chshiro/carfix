import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { users, providers } from '../../../../db/schema/index';
import { createAuthToken } from '../../../../server/auth';
import { env } from '../../../../lib/env';
import { ALLOWED_DEMO_USER_IDS, ALLOWED_DEMO_PROVIDER_IDS } from '../../../../db/seed';

export const dynamic = 'force-dynamic';

const demoTokenSchema = z.object({
  userId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  // Only available in development / test or when explicitly enabled in production
  if (env.NODE_ENV === 'production' && env.DEMO_MODE !== 'true') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Demo authentication disabled in production' } },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const validated = demoTokenSchema.parse(body);

    if (!validated.userId && !validated.providerId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'userId or providerId required' } },
        { status: 400 }
      );
    }

    // 1. Strict Server-Side Whitelist Validation BEFORE DB lookup
    if (validated.userId && !ALLOWED_DEMO_USER_IDS.has(validated.userId)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'User is not an authorized demo identity' } },
        { status: 403 }
      );
    }

    if (validated.providerId && !ALLOWED_DEMO_PROVIDER_IDS.has(validated.providerId)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Provider is not an authorized demo identity' } },
        { status: 403 }
      );
    }

    // 2. Resolve target user ID
    let targetUserId = validated.userId;

    if (!targetUserId && validated.providerId) {
      const [provider] = await db
        .select()
        .from(providers)
        .where(eq(providers.id, validated.providerId));
      if (provider) {
        targetUserId = provider.userId;
      }
    }

    if (!targetUserId) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Provider profile not found' } },
        { status: 404 }
      );
    }

    // 3. Authoritative DB user lookup
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId));

    if (!user) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    if (user.isBlocked) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'User account is blocked' } },
        { status: 403 }
      );
    }

    const token = await createAuthToken({
      sub: user.id,
      phone: user.phone,
      roles: user.roles,
    });

    return NextResponse.json({
      status: 'ok',
      data: {
        token,
        user: {
          id: user.id,
          phone: user.phone,
          roles: user.roles,
        },
      },
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input parameters',
            details: err.format(),
          },
        },
        { status: 400 }
      );
    }

    console.error('Demo auth error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}
