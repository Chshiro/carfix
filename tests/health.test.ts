import { describe, it, expect, vi } from 'vitest';
import { HealthService } from '../src/server/services/health.service';
import { db } from '../src/db/client';

describe('HealthService Smoke Tests', () => {
  it('returns ok when database query succeeds', async () => {
    // Mock db.execute to return success
    vi.spyOn(db, 'execute').mockResolvedValueOnce([] as any);

    const result = await HealthService.check();

    expect(result.status).toBe('ok');
    expect(result.db).toBe('ok');
    expect(result.timestamp).toBeDefined();
  });

  it('returns error and 503 payload when database fails', async () => {
    // Mock db.execute to throw an error
    vi.spyOn(db, 'execute').mockRejectedValueOnce(new Error('Connection timeout'));

    const result = await HealthService.check();

    expect(result.status).toBe('error');
    expect(result.db).toBe('error');
    expect(result.error).toBe('Connection timeout');
  });
});
