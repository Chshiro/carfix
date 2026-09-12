import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PaymentService } from '../../../../server/services/payment.service';
import { requireAuth } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

const withdrawSchema = z.object({
  amountTiyn: z.number().int().positive(),
  destinationType: z.enum(['KASPI_GOLD', 'HALYK_BANK', 'IBAN']),
  destinationAccount: z.string().min(4),
});

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, ['provider', 'admin']);
    const body = await req.json();
    const validated = withdrawSchema.parse(body);

    const result = await PaymentService.requestWithdrawal(
      authUser.id,
      validated.amountTiyn,
      validated.destinationType,
      validated.destinationAccount
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

    console.error('Unhandled error in POST /api/payments/withdraw:', error);
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
