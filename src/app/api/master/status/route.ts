import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { MasterService } from '../../../../server/services/master.service';
import { requireAuth } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

const toggleStatusSchema = z.object({
  isOnline: z.boolean(),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  radiusKm: z.number().min(1).max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth(req, ['provider', 'admin']);
    const body = await req.json();
    const validated = toggleStatusSchema.parse(body);

    const result = await MasterService.toggleStatus(validated, currentUser);

    return NextResponse.json(
      {
        status: 'ok',
        data: result,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Некорректные параметры смены',
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
    console.error('Master status toggle error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error during master status toggle',
        },
      },
      { status: 500 }
    );
  }
}
