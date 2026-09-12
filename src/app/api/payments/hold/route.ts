import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PaymentService } from '../../../../server/services/payment.service';
import { requireAuth } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

const holdSchema = z.object({
  orderId: z.string().uuid(),
  amountTiyn: z.number().int().positive(),
  paymentMethod: z.enum(['KASPI_QR', 'BANK_CARD', 'CASH']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, ['motorist', 'admin']);
    const body = await req.json();
    const validated = holdSchema.parse(body);

    const result = await PaymentService.createHold({
      orderId: validated.orderId,
      customerId: authUser.id,
      amountTiyn: validated.amountTiyn,
      paymentMethod: validated.paymentMethod,
    });

    return NextResponse.json(
      {
        status: 'ok',
        data: result,
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

    console.error('Unhandled error in POST /api/payments/hold:', error);
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
