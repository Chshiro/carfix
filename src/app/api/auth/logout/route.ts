import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '../../../../server/services/auth.service';
import { getSessionTokenFromRequest, clearSessionCookie } from '../../../../server/auth/session';
import { enforceCsrf } from '../../../../server/auth/csrf';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    enforceCsrf(req);

    const sessionToken = getSessionTokenFromRequest(req);
    if (sessionToken) {
      await AuthService.logout(sessionToken);
    }

    const clearCookieHeader = clearSessionCookie();

    return NextResponse.json(
      {
        status: 'ok',
        data: {
          message: 'Успешный выход из системы',
        },
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': clearCookieHeader,
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
          },
        },
        { status: err.statusCode }
      );
    }
    console.error('Logout error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error during logout',
        },
      },
      { status: 500 }
    );
  }
}
