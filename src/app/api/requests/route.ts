import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { RequestService } from '../../../server/services/request.service';
import { requireAuth } from '../../../server/auth';
import { AppError } from '../../../server/errors';

export const dynamic = 'force-dynamic';

const createRequestSchema = z.object({
  category: z.enum(['electrical_starting', 'battery_jumpstart', 'mobile_mechanic']),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  description: z.string().max(1000).optional(),
  vehicleId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth(req, ['motorist', 'admin']);
    const body = await req.json();
    const validated = createRequestSchema.parse(body);

    const result = await RequestService.createRequest({
      customerId: currentUser.id,
      category: validated.category,
      location: validated.location,
      description: validated.description,
      vehicleId: validated.vehicleId,
    });

    return NextResponse.json(
      {
        status: 'ok',
        data: {
          requestId: result.request.id,
          category: result.request.category,
          status: result.request.status,
          currentRadiusKm: result.request.currentRadiusKm,
          matchedProvidersCount: result.matchedProvidersCount,
          createdAt: result.request.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request input',
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
