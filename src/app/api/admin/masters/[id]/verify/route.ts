import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AdminService } from '../../../../../../server/services/admin.service';
import { requireAuth } from '../../../../../../server/auth';
import { AppError } from '../../../../../../server/errors';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const verifySchema = z.object({
  verificationStatus: z.enum(['VERIFIED', 'REJECTED', 'PENDING']).optional(),
  verificationLevel: z
    .enum(['LEVEL_1_VERIFIED_SERVICE', 'LEVEL_2_VERIFIED_MASTER', 'LEVEL_3_NEW_PROVIDER'])
    .optional(),
  isBlocked: z.boolean().optional(),
  blockReason: z.string().optional(),
  notes: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const validatedParams = paramsSchema.parse(params);
    const authUser = await requireAuth(req, ['admin']);

    const body = await req.json();
    const validatedBody = verifySchema.parse(body);

    const updatedMaster = await AdminService.updateProviderVerification(
      validatedParams.id,
      {
        ...validatedBody,
        adminId: authUser.id,
      }
    );

    return NextResponse.json({
      status: 'ok',
      data: updatedMaster,
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

    console.error('Unhandled error in PATCH /api/admin/masters/[id]/verify:', error);
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
