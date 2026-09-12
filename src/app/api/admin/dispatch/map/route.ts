import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '../../../../../server/services/admin.service';
import { requireAuth } from '../../../../../server/auth';
import { AppError } from '../../../../../server/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ['admin']);

    const orders = await AdminService.getAllActiveOrdersWithLocations();
    const providers = await AdminService.listProviders({ isOnline: true });

    return NextResponse.json({
      status: 'ok',
      data: {
        activeOrders: orders,
        onlineProviders: providers,
      },
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

    console.error('Unhandled error in GET /api/admin/dispatch/map:', error);
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
