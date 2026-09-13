import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthService } from '../../../../server/services/auth.service';
import { getClientIp } from '../../../../server/auth/client-ip';
import { enforceCsrf } from '../../../../server/auth/csrf';
import { createSessionCookie } from '../../../../server/auth/session';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

const verifyOtpSchema = z.object({
  phone: z.string({ required_error: 'Номер телефона обязателен' }).min(10, 'Некорректный номер телефона'),
  code: z
    .string({ required_error: 'Код подтверждения обязателен' })
    .regex(/^\d{6}$/, 'Код подтверждения должен состоять ровно из 6 цифр'),
});

export async function POST(req: NextRequest) {
  try {
    enforceCsrf(req);

    const body = await req.json().catch(() => ({}));
    const validated = verifyOtpSchema.parse(body);
    const clientIp = getClientIp(req);

    const result = await AuthService.verifyOtp(validated.phone, validated.code, clientIp);

    const cookieHeader = createSessionCookie(result.sessionToken, result.expiresAt);

    return NextResponse.json(
      {
        status: 'ok',
        data: {
          user: result.user,
        },
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': cookieHeader,
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: err.errors[0]?.message || 'Некорректные параметры подтверждения',
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
    console.error('Verify OTP unexpected error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Внутренняя ошибка при проверке кода',
        },
      },
      { status: 500 }
    );
  }
}
