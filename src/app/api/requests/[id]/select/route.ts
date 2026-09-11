import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OrderService } from '../../../../../server/services/order.service';
import { requireAuth } from '../../../../../server/auth';
import { AppError } from '../../../../../server/errors';

export const dynamic = 'force-dynamic';

const selectOfferSchema = z.object({
  offerId: z.string().uuid(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await requireAuth(req, ['motorist', 'admin']);
    const body = await req.json();
    const validated = selectOfferSchema.parse(body);

    const result = await OrderService.selectOffer(
      {
        requestId: params.id,
        offerId: validated.offerId,
      },
      currentUser
    );

    return NextResponse.json(
      {
        status: 'ok',
        data: result,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid selection input',
            details: err.format(),
          },
        },
        { status: 400 }
      );
    }
    if (err instanceof AppError) {
      return NextResponse.json(
        {
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        },
        { status: err.statusCode }
      );
    }
    console.error('Select offer error:', err);
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
