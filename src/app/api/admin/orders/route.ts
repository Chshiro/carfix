import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '../../../../server/services/admin.service';
import { requireAuth } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ['admin']);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;

    const ordersList = await AdminService.listOrders({ status, limit });

    return NextResponse.json({
      status: 'ok',
      data: ordersList,
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

    console.error('Unhandled error in GET /api/admin/orders:', error);
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
