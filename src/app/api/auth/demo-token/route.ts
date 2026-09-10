import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client';
import { users, providers } from '../../../../db/schema/index';
import { createAuthToken } from '../../../../server/auth';
import { env } from '../../../../lib/env';

export const dynamic = 'force-dynamic';

const demoTokenSchema = z.object({
  userId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  // Only available in development / demo mode
  if (env.NODE_ENV === 'production' && env.DEMO_MODE !== 'true') {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Demo authentication disabled in production' } },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const validated = demoTokenSchema.parse(body);

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
        { error: { code: 'BAD_REQUEST', message: 'userId or providerId required' } },
        { status: 400 }
      );
    }

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
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to issue demo token',
        },
      },
      { status: 500 }
    );
  }
}
