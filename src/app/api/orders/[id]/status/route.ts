import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OrderService } from '../../../../../server/services/order.service';
import { requireAuth } from '../../../../../server/auth';
import { AppError } from '../../../../../server/errors';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const updateStatusSchema = z.object({
  status: z.enum(['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  finalAmountTiyn: z.number().int().positive().optional(),
  cancellationReason: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const validatedParams = paramsSchema.parse(params);
    const currentUser = await requireAuth(req);
    const body = await req.json();
    const validatedBody = updateStatusSchema.parse(body);

    const result = await OrderService.updateOrderStatus(
      validatedParams.id,
      validatedBody,
      currentUser
    );

    return NextResponse.json({
      status: 'ok',
      data: result,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid status update input',
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
    console.error('Update order status error:', err);
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
