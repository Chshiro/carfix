import { NextRequest, NextResponse } from 'next/server';
import { OrderService } from '../../../../server/services/order.service';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Query parameter userId is required for authorization',
          },
        },
        { status: 400 }
      );
    }

    const order = await OrderService.getOrderById(params.id, userId);

    return NextResponse.json({
      status: 'ok',
      data: order,
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
          message: 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}
