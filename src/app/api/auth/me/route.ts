import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '../../../../server/auth';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);

    if (!user) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Сессия не найдена или истекла',
          },
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        status: 'ok',
        data: {
          user,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
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
    console.error('GET /api/auth/me error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error resolving user session',
        },
      },
      { status: 500 }
    );
  }
}
