import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ReviewService } from '../../../../../server/services/review.service';
import { requireAuth } from '../../../../../server/auth';
import { AppError } from '../../../../../server/errors';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const validatedParams = paramsSchema.parse(params);
    const currentUser = await requireAuth(req);
    const body = await req.json();
    const validatedBody = createReviewSchema.parse(body);

    const review = await ReviewService.createReview(
      validatedParams.id,
      validatedBody,
      currentUser
    );

    return NextResponse.json(
      {
        status: 'ok',
        data: review,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid review input',
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
    console.error('Create review error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const validatedParams = paramsSchema.parse(params);
    const currentUser = await requireAuth(req);
    const reviews = await ReviewService.getReviewsForOrder(validatedParams.id, currentUser);

    return NextResponse.json({
      status: 'ok',
      data: reviews,
    });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid order ID format',
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
    console.error('Get reviews error:', err);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
      },
      { status: 500 }
    );
  }
}
