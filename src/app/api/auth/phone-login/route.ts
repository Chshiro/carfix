import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { CustomerService } from '../../../../server/services/customer.service';
import { AppError } from '../../../../server/errors';

export const dynamic = 'force-dynamic';

const phoneLoginSchema = z.object({
  phone: z.string().min(10, 'Номер телефона должен содержать минимум 10 цифр'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = phoneLoginSchema.parse(body);

    const result = await CustomerService.phoneLogin(validated.phone);

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
            message: 'Некорректный номер телефона',
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
    console.error('Phone login error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error during phone login',
        },
      },
      { status: 500 }
    );
  }
}
