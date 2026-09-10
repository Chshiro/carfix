import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { serviceRequests, users, vehicles, orders, providers } from '../../db/schema/index';
import { ServiceCategory } from '../../types';
import { MatchingService } from './matching.service';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';
import { AuthUser } from '../auth';

export interface CreateRequestInput {
  customerId: string;
  category: ServiceCategory;
  location: { lat: number; lng: number };
  description?: string;
  vehicleId?: string;
}

export interface CreateRequestResult {
  request: typeof serviceRequests.$inferSelect;
  matchedProvidersCount: number;
}

export class RequestService {
  static async createRequest(input: CreateRequestInput): Promise<CreateRequestResult> {
    const { customerId, category, location, description, vehicleId } = input;

    // Validate customer exists and is not blocked
    const [customer] = await db.select().from(users).where(eq(users.id, customerId));
    if (!customer) {
      throw new NotFoundError('Customer user not found');
    }
    if (customer.isBlocked) {
      throw new ForbiddenError('Customer account is blocked');
    }

    // Validate category
    if (!['electrical_starting', 'battery_jumpstart', 'mobile_mechanic'].includes(category)) {
      throw new ValidationError(`Invalid category '${category}'`);
    }

    // Validate coordinates (Reject NaN, Infinite, Out-of-bounds)
    if (
      typeof location.lat !== 'number' ||
      typeof location.lng !== 'number' ||
      !Number.isFinite(location.lat) ||
      !Number.isFinite(location.lng) ||
      location.lat < -90 ||
      location.lat > 90 ||
      location.lng < -180 ||
      location.lng > 180
    ) {
      throw new ValidationError('Invalid latitude or longitude coordinates');
    }

    // Vehicle ownership validation
    if (vehicleId) {
      const [vehicle] = await db
        .select()
        .from(vehicles)
        .where(eq(vehicles.id, vehicleId));

      if (!vehicle) {
        throw new NotFoundError('Specified vehicle not found');
      }

      if (vehicle.userId !== customerId) {
        throw new ForbiddenError('Vehicle does not belong to the authenticated customer');
      }
    }

    const requiredCapabilities = MatchingService.getRequiredCapabilitiesForCategory(category);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes
    const nextExpansionAt = new Date(now.getTime() + 3 * 60 * 1000); // 3 minutes

    // Insert request
    const [request] = await db
      .insert(serviceRequests)
      .values({
        customerId,
        category,
        requiredCapabilities,
        vehicleId: vehicleId || null,
        description: description || null,
        location: { lat: location.lat, lng: location.lng },
        status: 'PUBLISHED',
        currentRadiusKm: 5,
        publishedAt: now,
        expiresAt,
        nextExpansionAt,
      })
      .returning();

    // Execute matching deterministically to get provider count
    const matchedProviders = await MatchingService.findMatchingProviders(
      location,
      requiredCapabilities,
      5
    );

    return {
      request,
      matchedProvidersCount: matchedProviders.length,
    };
  }

  static async getRequestById(id: string, currentUser?: AuthUser) {
    const [request] = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, id));

    if (!request) {
      throw new NotFoundError('Service request not found');
    }

    if (!currentUser) {
      return request;
    }

    const isAdmin = currentUser.roles.includes('admin');
    const isCustomerOwner = request.customerId === currentUser.id;

    if (isAdmin || isCustomerOwner) {
      // Customer owner and admin have full access to exact location
      return request;
    }

    // If current user is a provider
    if (currentUser.providerId) {
      const providerId = currentUser.providerId;

      // Check if an order exists where this provider is the selected provider
      const [order] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.requestId, request.id),
            eq(orders.providerId, providerId)
          )
        );

      if (order) {
        // Selected provider gets full request with exact location
        return request;
      }

      // Check if provider is matched/eligible
      const pointWkt = `SRID=4326;POINT(${request.location.lng} ${request.location.lat})`;
      const radiusMeters = request.currentRadiusKm * 1000;
      const capSqlElements = request.requiredCapabilities.map((cap) => sql`${cap}`);
      const capArraySql = sql`ARRAY[${sql.join(capSqlElements, sql`, `)}]`;

      const eligibilityCheck = await db.execute<{ eligible: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1
          FROM providers p
          JOIN users u ON u.id = p.user_id
          JOIN provider_availability pa ON pa.provider_id = p.id
          JOIN provider_capabilities pc ON pc.provider_id = p.id
          JOIN provider_service_modes psm ON psm.provider_id = p.id
          WHERE p.id = ${providerId}
            AND u.is_blocked = FALSE
            AND pa.is_online = TRUE
            AND pa.location_updated_at >= NOW() - INTERVAL '4 hours'
            AND psm.service_mode = 'MOBILE'
            AND pc.is_active = TRUE
            AND pc.capability = ANY(${capArraySql})
            AND ST_DWithin(pa.location, ST_GeogFromText(${pointWkt}), ${radiusMeters})
        ) AS eligible
      `);

      const isEligible = (eligibilityCheck as unknown as Array<{ eligible: boolean }>)[0]?.eligible;

      if (!isEligible) {
        throw new ForbiddenError('Access denied: You are not an eligible provider for this request');
      }

      // Matched provider before selection: exact location MUST NOT be exposed
      return {
        ...request,
        location: null, // Masked for privacy before selection
      };
    }

    throw new ForbiddenError('You do not have permission to view this request');
  }
}
