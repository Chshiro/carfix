import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PaymentService } from '../../../../server/services/payment.service';
import { requireAuth } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

const splitSchema = z.object({
  orderId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, ['provider', 'admin']);
    const body = await req.json();
    const validated = splitSchema.parse(body);

    const isAdmin = authUser.roles.includes('admin');
    const result = await PaymentService.captureAndSplit(
      validated.orderId,
      isAdmin ? undefined : authUser.providerId
    );

    return NextResponse.json({
      status: 'ok',
      data: result,
    });
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

    console.error('Unhandled error in POST /api/payments/complete-split:', error);
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
