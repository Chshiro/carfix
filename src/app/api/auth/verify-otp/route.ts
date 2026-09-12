import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CustomerService } from '../../../../server/services/customer.service';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

const verifyOtpSchema = z.object({
  phone: z.string().min(10, 'Номер телефона должен содержать минимум 10 цифр'),
  code: z.string().length(4, 'Код подтверждения должен состоять из 4 цифр'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = verifyOtpSchema.parse(body);

    const result = await CustomerService.verifyOtp(validated.phone, validated.code);

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
    console.error('Verify OTP error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error during OTP verification',
        },
      },
      { status: 500 }
    );
  }
}
