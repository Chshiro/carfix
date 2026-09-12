import { NextRequest, NextResponse } from 'next/server';
import { MaintenanceService } from '../../../../server/services/maintenance.service';
import { requireAuth } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req, ['admin']);

    const result = await MaintenanceService.runSweep();

    return NextResponse.json(
      {
        status: 'ok',
        data: result,
      },
      { status: 200 }
    );
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

    console.error('Unhandled error in POST /api/maintenance/sweep:', error);
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
