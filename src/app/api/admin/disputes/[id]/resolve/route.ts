import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminService } from '../../../../../../server/services/admin.service';
import { requireAuth } from '../../../../../../server/auth';
import { AppError } from '../../../../../../server/errors';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const resolveSchema = z.object({
  resolution: z.enum(['RESOLVED_REFUND', 'RESOLVED_RELEASE', 'RESOLVED_SPLIT', 'DISMISSED']),
  refundAmountTiyn: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const validatedParams = paramsSchema.parse(params);
    const authUser = await requireAuth(req, ['admin']);

    const body = await req.json();
    const validatedBody = resolveSchema.parse(body);

    const resolved = await AdminService.resolveDispute(
      validatedParams.id,
      validatedBody.resolution,
      validatedBody.refundAmountTiyn,
      validatedBody.notes,
      authUser.id
    );

    return NextResponse.json({
      status: 'ok',
      data: resolved,
    });
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

    console.error('Unhandled error in POST /api/admin/disputes/[id]/resolve:', error);
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
