import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { MasterService } from '../../../../server/services/master.service';
import { requireAuth } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

const updateLocationSchema = z.object({
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
});

export async function PATCH(req: NextRequest) {
  try {
    const currentUser = await requireAuth(req, ['provider', 'admin']);
    const body = await req.json();
    const validated = updateLocationSchema.parse(body);

    const result = await MasterService.updateLocation(validated, currentUser);

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
            message: 'Некорректные координаты мастера',
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
    console.error('Master location update error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error during master location update',
        },
      },
      { status: 500 }
    );
  }
}
