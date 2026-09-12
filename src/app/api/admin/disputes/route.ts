import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminService } from '../../../../server/services/admin.service';
import { requireAuth } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

const createDisputeSchema = z.object({
  orderId: z.string().uuid(),
  reason: z.string().min(3),
});

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ['admin']);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;

    const disputesList = await AdminService.listDisputes(status);

    return NextResponse.json({
      status: 'ok',
      data: disputesList,
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

    console.error('Unhandled error in GET /api/admin/disputes:', error);
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

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuth(req, ['motorist', 'provider', 'admin']);
    const body = await req.json();
    const validated = createDisputeSchema.parse(body);

    const disputeId = await AdminService.createDispute(
      validated.orderId,
      authUser.id,
      validated.reason
    );

    return NextResponse.json(
      {
        status: 'ok',
        data: { id: disputeId },
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

    console.error('Unhandled error in POST /api/admin/disputes:', error);
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
