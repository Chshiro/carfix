import { sql } from 'drizzle-orm';
import { db } from '../../db/client';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  db: 'ok' | 'error';
  timestamp: string;
  error?: string;
}

export class HealthService {
  static async check(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    try {
      // Execute a lightweight query to verify DB connection
      await db.execute(sql`SELECT 1`);
      return {
        status: 'ok',
        db: 'ok',
        timestamp,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Database check failed';
      return {
        status: 'error',
        db: 'error',
        timestamp,
        error: errorMessage,
      };
    }
  }
}
