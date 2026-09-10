import { NextRequest, NextResponse } from 'next/server';
import { OfferService } from '../../../../../server/services/offer.service';
import { requireAuth } from '../../../../../server/auth';
import { AppError } from '../../../../../server/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await requireAuth(req);
    const offers = await OfferService.getOffersForRequest(params.id, currentUser);

    return NextResponse.json({
      status: 'ok',
      data: offers,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json(
        {
          error: {
            code: err.code,
            message: err.message,
          },
        },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}
