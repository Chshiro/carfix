import { NextRequest, NextResponse } from 'next/server';
import { AdminService } from '../../../../server/services/admin.service';
import { requireAuth } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req, ['admin']);

    const { searchParams } = new URL(req.url);
    const verificationLevel = searchParams.get('verificationLevel') || undefined;
    const isOnlineParam = searchParams.get('isOnline');
    const isBlockedParam = searchParams.get('isBlocked');

    const isOnline = isOnlineParam !== null ? isOnlineParam === 'true' : undefined;
    const isBlocked = isBlockedParam !== null ? isBlockedParam === 'true' : undefined;

    const providersList = await AdminService.listProviders({
      verificationLevel,
      isOnline,
      isBlocked,
    });

    return NextResponse.json({
      status: 'ok',
      data: providersList,
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

    console.error('Unhandled error in GET /api/admin/providers:', error);
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
