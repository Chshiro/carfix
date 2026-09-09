import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { serviceRequests, users } from '../../db/schema/index';
import { ServiceCategory } from '../../types';
import { MatchingService, MatchedProvider } from './matching.service';
import { NotFoundError, ValidationError } from '../errors';

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
  matchedProviders: MatchedProvider[];
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
      throw new ValidationError('Customer account is blocked');
    }

    // Validate category
    if (!['electrical_starting', 'battery_jumpstart', 'mobile_mechanic'].includes(category)) {
      throw new ValidationError(`Invalid category '${category}'`);
    }

    // Validate coordinates (Astana / Kazakhstan bounds check)
    if (location.lat < -90 || location.lat > 90 || location.lng < -180 || location.lng > 180) {
      throw new ValidationError('Invalid latitude or longitude coordinates');
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

    // Execute matching
    const matchedProviders = await MatchingService.findMatchingProviders(
      location,
      requiredCapabilities,
      5
    );

    return {
      request,
      matchedProvidersCount: matchedProviders.length,
      matchedProviders,
    };
  }

  static async getRequestById(id: string) {
    const [request] = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, id));

    if (!request) {
      throw new NotFoundError('Service request not found');
    }

    return request;
  }
}
