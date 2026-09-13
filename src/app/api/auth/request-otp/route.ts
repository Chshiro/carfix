import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthService } from '../../../../server/services/auth.service';
import { getClientIp } from '../../../../server/auth/client-ip';
import { enforceCsrf } from '../../../../server/auth/csrf';
import { AppError, RateLimitError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

const requestOtpSchema = z.object({
  phone: z.string({ required_error: 'Номер телефона обязателен' }).min(10, 'Некорректный номер телефона'),
});

export async function POST(req: NextRequest) {
  try {
    enforceCsrf(req);

    const body = await req.json().catch(() => ({}));
    const validated = requestOtpSchema.parse(body);
    const clientIp = getClientIp(req);

    const result = await AuthService.requestOtp(validated.phone, clientIp);

    return NextResponse.json(
      {
        status: 'ok',
        data: result,
      },
      {
        status: 200,
        headers: {
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
            message: err.errors[0]?.message || 'Некорректный номер телефона',
            details: err.format(),
          },
        },
        { status: 400 }
      );
    }
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        {
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(err.retryAfterSeconds),
          },
        }
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
    console.error('Request OTP unexpected error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Внутренняя ошибка при отправке SMS. Пожалуйста, повторите позже.',
        },
      },
      { status: 500 }
    );
  }
}
