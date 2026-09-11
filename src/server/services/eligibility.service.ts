import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  providers,
  users,
  serviceRequests,
  providerCapabilities,
  providerAvailability,
  providerServiceModes,
} from '../../db/schema/index';
import { ForbiddenError, NotFoundError, ConflictError } from '../errors';

export type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

interface SpatialCheckRow extends Record<string, unknown> {
  is_online: boolean;
  location_fresh: boolean;
  distance_meters: number;
  within_radius: boolean;
}

export class ProviderEligibilityService {
  /**
   * Deterministically verifies whether a provider is eligible to submit an offer for a service request.
   * Operates within a provided transaction context (or default db client).
   *
   * Checks performed:
   * 1. Provider exists and user is not blocked
   * 2. Request exists and is in a submittable state (PUBLISHED or OFFERS_RECEIVED)
   * 3. Request is not expired (expiresAt > NOW())
   * 4. Provider has 'MOBILE' service mode
   * 5. Provider has active capabilities matching request requirements (OR semantics)
   * 6. Provider is currently online
   * 7. Provider location is fresh (updated within the last 4 hours)
   * 8. Provider is within the current matching radius (ST_DWithin)
   */
  static async assertEligible(
    providerId: string,
    requestId: string,
    executor: DbExecutor = db,
    preloadedRequest?: typeof serviceRequests.$inferSelect
  ): Promise<{
    provider: typeof providers.$inferSelect;
    request: typeof serviceRequests.$inferSelect;
    distanceMeters: number;
  }> {
    // 1. Verify Provider exists and is not blocked
    const [provider] = await executor
      .select()
      .from(providers)
      .where(eq(providers.id, providerId));

    if (!provider) {
      throw new NotFoundError('Provider profile not found');
    }

    const [providerUser] = await executor
      .select()
      .from(users)
      .where(eq(users.id, provider.userId));

    if (!providerUser || providerUser.isBlocked) {
      throw new ForbiddenError('Provider account is blocked or inactive');
    }

    // 2. Verify Request exists and is submittable
    let request = preloadedRequest;
    if (!request) {
      const [fetched] = await executor
        .select()
        .from(serviceRequests)
        .where(eq(serviceRequests.id, requestId));
      request = fetched;
    }

    if (!request) {
      throw new NotFoundError('Service request not found');
    }

    if (request.status !== 'PUBLISHED' && request.status !== 'OFFERS_RECEIVED') {
      throw new ConflictError(
        `Cannot submit offer: request is in status '${request.status}'`
      );
    }

    // 3. Verify Request is not expired
    if (new Date(request.expiresAt).getTime() <= Date.now()) {
      throw new ConflictError('Cannot submit offer: request has expired');
    }

    // 4. Verify Provider supports MOBILE service mode
    const [mobileMode] = await executor
      .select()
      .from(providerServiceModes)
      .where(
        and(
          eq(providerServiceModes.providerId, providerId),
          eq(providerServiceModes.serviceMode, 'MOBILE')
        )
      );

    if (!mobileMode) {
      throw new ForbiddenError('Provider does not support mobile (on-site) service mode');
    }

    // 5. Verify Capability match (OR semantics)
    const capabilities = await executor
      .select()
      .from(providerCapabilities)
      .where(
        and(
          eq(providerCapabilities.providerId, providerId),
          eq(providerCapabilities.isActive, true)
        )
      );

    const hasMatchingCapability = capabilities.some((c: typeof providerCapabilities.$inferSelect) =>
      request!.requiredCapabilities.includes(c.capability)
    );

    if (!hasMatchingCapability) {
      throw new ForbiddenError(
        'Provider does not have the required capabilities for this request'
      );
    }

    // 6. Verify Availability, Online status, Fresh location, and Spatial Proximity
    const radiusMeters = request.currentRadiusKm * 1000;
    const pointWkt = `SRID=4326;POINT(${request.location.lng} ${request.location.lat})`;

    const spatialCheck = await executor.execute(sql`
      SELECT 
        pa.is_online,
        (pa.location_updated_at >= NOW() - INTERVAL '4 hours') AS location_fresh,
        ROUND(ST_Distance(pa.location, ST_GeogFromText(${pointWkt}))) AS distance_meters,
        ST_DWithin(pa.location, ST_GeogFromText(${pointWkt}), ${radiusMeters}) AS within_radius
      FROM provider_availability pa
      WHERE pa.provider_id = ${providerId}
    `);

    const rows = spatialCheck as unknown as SpatialCheckRow[];
    const availability = rows[0];

    if (!availability) {
      throw new ForbiddenError('Provider availability/location not configured');
    }

    if (!availability.is_online) {
      throw new ForbiddenError('Provider is currently offline');
    }

    if (!availability.location_fresh) {
      throw new ForbiddenError('Provider location is stale (> 4 hours old)');
    }

    if (!availability.within_radius) {
      throw new ForbiddenError(
        `Provider is outside the current search radius (${request.currentRadiusKm} km)`
      );
    }

    return {
      provider,
      request,
      distanceMeters: Number(availability.distance_meters),
    };
  }
}
