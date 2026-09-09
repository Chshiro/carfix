import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OfferService } from '../../../server/services/offer.service';
import { AppError } from '../../../server/errors';

export const dynamic = 'force-dynamic';

const createOfferSchema = z.object({
  requestId: z.string().uuid(),
  providerId: z.string().uuid(),
  pricingMode: z.enum(['fixed', 'diagnostic_fee', 'estimate_range']),
  amountTiyn: z.number().int().positive().optional(),
  minAmountTiyn: z.number().int().positive().optional(),
  maxAmountTiyn: z.number().int().positive().optional(),
  etaMinutes: z.number().int().min(1).max(480),
  message: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = createOfferSchema.parse(body);

    const offer = await OfferService.createOffer({
      requestId: validated.requestId,
      providerId: validated.providerId,
      pricingMode: validated.pricingMode,
      amountTiyn: validated.amountTiyn,
      minAmountTiyn: validated.minAmountTiyn,
      maxAmountTiyn: validated.maxAmountTiyn,
      etaMinutes: validated.etaMinutes,
      message: validated.message,
    });

    return NextResponse.json(
      {
        status: 'ok',
        data: offer,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid offer input',
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
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}
