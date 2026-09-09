import { NextResponse } from 'next/server';
import { HealthService } from '../../../server/services/health.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await HealthService.check();

  if (result.status !== 'ok' || result.db !== 'ok') {
    return NextResponse.json(
      {
        status: 'error',
        db: result.db,
        timestamp: result.timestamp,
        error: result.error,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: 'ok',
    db: 'ok',
    timestamp: result.timestamp,
  });
}
