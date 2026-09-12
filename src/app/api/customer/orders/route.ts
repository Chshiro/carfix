import { NextRequest, NextResponse } from 'next/server';
import { CustomerService } from '../../../../server/services/customer.service';
import { requireAuth } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const currentUser = await requireAuth(req, ['motorist', 'admin']);
    const ordersList = await CustomerService.getCustomerOrders(currentUser);

    return NextResponse.json(
      {
        status: 'ok',
        data: ordersList,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
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
    console.error('Customer orders error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error while fetching customer orders',
        },
      },
      { status: 500 }
    );
  }
}
