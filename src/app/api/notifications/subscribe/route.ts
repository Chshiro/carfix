import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { NotificationService } from '../../../../server/services/notification.service';
import { requireAuth } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dhKey: z.string().min(1),
  authKey: z.string().min(1),
  deviceType: z.enum(['WEB', 'ANDROID', 'IOS']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, ['motorist', 'provider', 'admin']);
    const body = await req.json();
    const validated = subscribeSchema.parse(body);

    const subscriptionId = await NotificationService.registerPushSubscription(
      authUser.id,
      validated
    );

    return NextResponse.json(
      {
        status: 'ok',
        data: { subscriptionId },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'VALIDATION_ERROR',
          message: error.errors[0]?.message || 'Invalid input data',
        },
        { status: 400 }
      );
    }

    if (error instanceof AppError) {
      return NextResponse.json(
        {
          status: 'error',
          code: error.code,
          message: error.message,
        },
        { status: error.statusCode }
      );
    }

    console.error('Unhandled error in POST /api/notifications/subscribe:', error);
    return NextResponse.json(
      {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal server error occurred',
      },
      { status: 500 }
    );
  }
}
