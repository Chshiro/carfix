import { NextRequest, NextResponse } from 'next/server';
import { PaymentService } from '../../../../server/services/payment.service';
import { requireAuth } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, ['provider', 'motorist', 'admin']);

    const wallet = await PaymentService.getWallet(authUser.id);

    return NextResponse.json({
      status: 'ok',
      data: wallet,
    });
  } catch (error: unknown) {
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

    console.error('Unhandled error in GET /api/payments/wallet:', error);
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
