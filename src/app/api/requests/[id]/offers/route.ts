import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OfferService } from '../../../../../server/services/offer.service';
import { requireAuth } from '../../../../../server/auth';
import { AppError } from '../../../../../server/errors';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const validatedParams = paramsSchema.parse(params);
    const currentUser = await requireAuth(req);
    const offers = await OfferService.getOffersForRequest(validatedParams.id, currentUser);

    return NextResponse.json({
      status: 'ok',
      data: offers,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request ID format',
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
    console.error('Get offers error:', err);
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

