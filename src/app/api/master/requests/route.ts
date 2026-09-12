import { NextRequest, NextResponse } from 'next/server';
import { MasterService } from '../../../../server/services/master.service';
import { requireAuth } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const currentUser = await requireAuth(req, ['provider', 'admin']);
    const requests = await MasterService.getNearbyRequests(currentUser);

    return NextResponse.json(
      {
        status: 'ok',
        data: requests,
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
    console.error('Master nearby requests error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error while fetching nearby requests for master',
        },
      },
      { status: 500 }
    );
  }
}
