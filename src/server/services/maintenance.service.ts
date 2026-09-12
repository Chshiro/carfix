import { and, eq, inArray, lte, gt, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  serviceRequests,
  providerOffers,
  providerAvailability,
} from '../../db/schema/index';

export interface SweepResult {
  expandedRequestsCount: number;
  expiredRequestsCount: number;
  autoOfflinedProvidersCount: number;
  timestamp: string;
}

export class MaintenanceService {
  /**
   * 1. Dynamic Radius Expansion:
   * Expands dispatch radius (5 -> 10 -> 15 -> 25 km) for active requests
   * where nextExpansionAt <= NOW() and expiresAt > NOW() and currentRadiusKm < 25.
   */
  static async expandRequestRadii(now: Date = new Date()): Promise<number> {
    // Find eligible requests
    const candidates = await db
      .select({
        id: serviceRequests.id,
        currentRadiusKm: serviceRequests.currentRadiusKm,
      })
      .from(serviceRequests)
      .where(
        and(
          inArray(serviceRequests.status, ['PUBLISHED', 'OFFERS_RECEIVED']),
          lte(serviceRequests.nextExpansionAt, now),
          gt(serviceRequests.expiresAt, now),
          sql`${serviceRequests.currentRadiusKm} < 25`
        )
      );

    if (candidates.length === 0) {
      return 0;
    }

    let expandedCount = 0;
    const nextExpansion = new Date(now.getTime() + 3 * 60 * 1000); // +3 minutes

    for (const req of candidates) {
      let nextRadius = 10;
      if (req.currentRadiusKm === 5) {
        nextRadius = 10;
      } else if (req.currentRadiusKm === 10) {
        nextRadius = 15;
      } else if (req.currentRadiusKm >= 15) {
        nextRadius = 25;
      }

      await db
        .update(serviceRequests)
        .set({
          currentRadiusKm: nextRadius,
          nextExpansionAt: nextExpansion,
          updatedAt: now,
        })
        .where(eq(serviceRequests.id, req.id));

      expandedCount++;
    }

    return expandedCount;
  }

  /**
   * 2. Request Expiration:
   * Transitions unfulfilled requests to EXPIRED where expiresAt <= NOW().
   * Also marks lingering SUBMITTED offers for these requests as REJECTED.
   */
  static async expireStaleRequests(now: Date = new Date()): Promise<number> {
    const expiredRequests = await db
      .select({ id: serviceRequests.id })
      .from(serviceRequests)
      .where(
        and(
          inArray(serviceRequests.status, ['PUBLISHED', 'OFFERS_RECEIVED']),
          lte(serviceRequests.expiresAt, now)
        )
      );

    if (expiredRequests.length === 0) {
      return 0;
    }

    const expiredIds = expiredRequests.map((r) => r.id);

    // Update requests to EXPIRED
    await db
      .update(serviceRequests)
      .set({
        status: 'EXPIRED',
        updatedAt: now,
      })
      .where(inArray(serviceRequests.id, expiredIds));

    // Reject all submitted offers for expired requests
    await db
      .update(providerOffers)
      .set({
        status: 'REJECTED',
        updatedAt: now,
      })
      .where(
        and(
          inArray(providerOffers.requestId, expiredIds),
          eq(providerOffers.status, 'SUBMITTED')
        )
      );

    return expiredIds.length;
  }

  /**
   * 3. Provider Auto-Offline:
   * Sets is_online = FALSE for providers where autoOfflineAt <= NOW().
   */
  static async autoOfflineStaleProviders(now: Date = new Date()): Promise<number> {
    const staleProviders = await db
      .select({ id: providerAvailability.id })
      .from(providerAvailability)
      .where(
        and(
          eq(providerAvailability.isOnline, true),
          lte(providerAvailability.autoOfflineAt, now)
        )
      );

    if (staleProviders.length === 0) {
      return 0;
    }

    const staleIds = staleProviders.map((p) => p.id);

    await db
      .update(providerAvailability)
      .set({
        isOnline: false,
        updatedAt: now,
      })
      .where(inArray(providerAvailability.id, staleIds));

    return staleIds.length;
  }

  /**
   * Consolidated Maintenance Sweep: runs all 3 operations atomically.
   */
  static async runSweep(now: Date = new Date()): Promise<SweepResult> {
    const expandedRequestsCount = await this.expandRequestRadii(now);
    const expiredRequestsCount = await this.expireStaleRequests(now);
    const autoOfflinedProvidersCount = await this.autoOfflineStaleProviders(now);

    return {
      expandedRequestsCount,
      expiredRequestsCount,
      autoOfflinedProvidersCount,
      timestamp: now.toISOString(),
    };
  }
}
