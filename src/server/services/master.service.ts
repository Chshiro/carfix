import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  users,
  providers,
  providerAvailability,
  providerCapabilities,
  serviceRequests,
  providerOffers,
  orders,
  reviews,
  parseGeographyPoint,
} from '../../db/schema/index';
import { AuthUser } from '../auth';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';

export interface ToggleStatusInput {
  isOnline: boolean;
  location?: { lat: number; lng: number };
  radiusKm?: number;
}

export interface UpdateLocationInput {
  location: { lat: number; lng: number };
}

export class MasterService {
  /**
   * Resolves the provider record belonging to the authenticated user.
   */
  static async resolveProviderForUser(currentUser: AuthUser) {
    if (currentUser.isBlocked) {
      throw new ForbiddenError('Учетная запись заблокирована');
    }

    // Try finding provider by providerId if set on token
    let providerRow;
    if (currentUser.providerId) {
      [providerRow] = await db
        .select()
        .from(providers)
        .where(eq(providers.id, currentUser.providerId));
    }

    // Otherwise find provider by userId
    if (!providerRow) {
      [providerRow] = await db
        .select()
        .from(providers)
        .where(eq(providers.userId, currentUser.id));
    }

    if (!providerRow) {
      throw new NotFoundError('Профиль мастера не найден');
    }

    return providerRow;
  }

  /**
   * Toggles online/offline status and updates location.
   */
  static async toggleStatus(input: ToggleStatusInput, currentUser: AuthUser) {
    const provider = await this.resolveProviderForUser(currentUser);
    const { isOnline, location, radiusKm } = input;

    // Validate coordinates if provided
    if (location) {
      if (
        typeof location.lat !== 'number' ||
        typeof location.lng !== 'number' ||
        !Number.isFinite(location.lat) ||
        !Number.isFinite(location.lng)
      ) {
        throw new ValidationError('Некорректные координаты мастера');
      }
    }

    const [existingAvailability] = await db
      .select()
      .from(providerAvailability)
      .where(eq(providerAvailability.providerId, provider.id));

    const now = new Date();
    const autoOfflineAt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours shift
    const defaultCoords = location || (existingAvailability ? parseGeographyPoint(existingAvailability.location) : { lat: 51.135, lng: 71.428 });
    const targetRadius = radiusKm || (existingAvailability?.radiusKm ?? 12);

    if (existingAvailability) {
      const [updated] = await db
        .update(providerAvailability)
        .set({
          isOnline,
          location: defaultCoords,
          radiusKm: targetRadius,
          locationUpdatedAt: now,
          autoOfflineAt,
          updatedAt: now,
        })
        .where(eq(providerAvailability.providerId, provider.id))
        .returning();

      return {
        providerId: provider.id,
        isOnline: updated.isOnline,
        location: parseGeographyPoint(updated.location),
        radiusKm: updated.radiusKm,
        autoOfflineAt: updated.autoOfflineAt,
      };
    } else {
      const [inserted] = await db
        .insert(providerAvailability)
        .values({
          providerId: provider.id,
          isOnline,
          location: defaultCoords,
          radiusKm: targetRadius,
          autoOfflineAt,
        })
        .returning();

      return {
        providerId: provider.id,
        isOnline: inserted.isOnline,
        location: parseGeographyPoint(inserted.location),
        radiusKm: inserted.radiusKm,
        autoOfflineAt: inserted.autoOfflineAt,
      };
    }
  }

  /**
   * Updates current GPS coordinates of the master while on shift.
   */
  static async updateLocation(input: UpdateLocationInput, currentUser: AuthUser) {
    const provider = await this.resolveProviderForUser(currentUser);
    const { location } = input;

    if (
      typeof location.lat !== 'number' ||
      typeof location.lng !== 'number' ||
      !Number.isFinite(location.lat) ||
      !Number.isFinite(location.lng)
    ) {
      throw new ValidationError('Некорректные координаты мастера');
    }

    const now = new Date();
    const [existing] = await db
      .select()
      .from(providerAvailability)
      .where(eq(providerAvailability.providerId, provider.id));

    if (existing) {
      const [updated] = await db
        .update(providerAvailability)
        .set({
          location,
          locationUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(providerAvailability.providerId, provider.id))
        .returning();

      return {
        providerId: provider.id,
        location: parseGeographyPoint(updated.location),
        isOnline: updated.isOnline,
      };
    } else {
      const [inserted] = await db
        .insert(providerAvailability)
        .values({
          providerId: provider.id,
          location,
          isOnline: true,
          radiusKm: 12,
          autoOfflineAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
        })
        .returning();

      return {
        providerId: provider.id,
        location: parseGeographyPoint(inserted.location),
        isOnline: inserted.isOnline,
      };
    }
  }

  /**
   * Retrieves active master state (online availability, active in-progress order, submitted offers).
   */
  static async getActiveState(currentUser: AuthUser) {
    const provider = await this.resolveProviderForUser(currentUser);

    // 1. Fetch Availability & Capabilities
    const [availability] = await db
      .select()
      .from(providerAvailability)
      .where(eq(providerAvailability.providerId, provider.id));

    const capabilities = await db
      .select()
      .from(providerCapabilities)
      .where(
        and(
          eq(providerCapabilities.providerId, provider.id),
          eq(providerCapabilities.isActive, true)
        )
      );

    // 2. Check for Active / In-Progress Order
    const activeOrderStatuses = [
      'PROVIDER_SELECTED',
      'CONFIRMED',
      'EN_ROUTE',
      'ARRIVED',
      'IN_PROGRESS',
      'PAYMENT_PENDING',
    ];

    const activeOrderRows = await db
      .select({
        order: orders,
        customerUser: users,
        offer: providerOffers,
        request: serviceRequests,
      })
      .from(orders)
      .innerJoin(users, eq(orders.customerId, users.id))
      .innerJoin(providerOffers, eq(orders.offerId, providerOffers.id))
      .innerJoin(serviceRequests, eq(orders.requestId, serviceRequests.id))
      .where(
        and(
          eq(orders.providerId, provider.id),
          inArray(orders.status, activeOrderStatuses)
        )
      )
      .orderBy(desc(orders.updatedAt))
      .limit(1);

    // 3. Fetch Submitted Active Offers
    const submittedOfferRows = await db
      .select({
        offer: providerOffers,
        request: serviceRequests,
      })
      .from(providerOffers)
      .innerJoin(serviceRequests, eq(providerOffers.requestId, serviceRequests.id))
      .where(
        and(
          eq(providerOffers.providerId, provider.id),
          eq(providerOffers.status, 'SUBMITTED'),
          sql`${serviceRequests.status} IN ('PUBLISHED', 'OFFERS_RECEIVED', 'MATCHING')`,
          sql`${serviceRequests.expiresAt} > NOW()`
        )
      )
      .orderBy(desc(providerOffers.createdAt));

    return {
      provider: {
        id: provider.id,
        businessName: provider.businessName,
        providerType: provider.providerType,
        rating: provider.rating,
        completedJobs: provider.completedJobs,
        verificationLevel: provider.verificationLevel,
        capabilities: capabilities.map((c) => c.capability),
      },
      availability: availability
        ? {
            isOnline: availability.isOnline,
            location: parseGeographyPoint(availability.location),
            radiusKm: availability.radiusKm,
            autoOfflineAt: availability.autoOfflineAt,
          }
        : null,
      activeOrder: activeOrderRows.length > 0
        ? {
            id: activeOrderRows[0].order.id,
            status: activeOrderRows[0].order.status,
            agreedPricingMode: activeOrderRows[0].order.agreedPricingMode,
            agreedAmountTiyn: activeOrderRows[0].order.agreedAmountTiyn,
            finalAmountTiyn: activeOrderRows[0].order.finalAmountTiyn,
            createdAt: activeOrderRows[0].order.createdAt,
            updatedAt: activeOrderRows[0].order.updatedAt,
            customer: {
              id: activeOrderRows[0].customerUser.id,
              phone: activeOrderRows[0].customerUser.phone,
            },
            request: {
              id: activeOrderRows[0].request.id,
              category: activeOrderRows[0].request.category,
              description: activeOrderRows[0].request.description,
              location: parseGeographyPoint(activeOrderRows[0].request.location),
              createdAt: activeOrderRows[0].request.createdAt,
            },
            offer: {
              id: activeOrderRows[0].offer.id,
              pricingMode: activeOrderRows[0].offer.pricingMode,
              amountTiyn: activeOrderRows[0].offer.amountTiyn,
              etaMinutes: activeOrderRows[0].offer.etaMinutes,
              message: activeOrderRows[0].offer.message,
            },
          }
        : null,
      submittedOffers: submittedOfferRows.map((row) => ({
        id: row.offer.id,
        requestId: row.request.id,
        category: row.request.category,
        description: row.request.description,
        location: parseGeographyPoint(row.request.location),
        pricingMode: row.offer.pricingMode,
        amountTiyn: row.offer.amountTiyn,
        etaMinutes: row.offer.etaMinutes,
        message: row.offer.message,
        createdAt: row.offer.createdAt,
      })),
    };
  }

  /**
   * Retrieves live feed of open customer requests within provider's radius, sorted by distance.
   */
  static async getNearbyRequests(currentUser: AuthUser) {
    const provider = await this.resolveProviderForUser(currentUser);

    const [availability] = await db
      .select()
      .from(providerAvailability)
      .where(eq(providerAvailability.providerId, provider.id));

    if (!availability || !availability.isOnline) {
      return [];
    }

    const providerCoords = parseGeographyPoint(availability.location);
    const radiusMeters = availability.radiusKm * 1000;
    const pointWkt = `SRID=4326;POINT(${providerCoords.lng} ${providerCoords.lat})`;

    // Get Provider Capabilities
    const caps = await db
      .select()
      .from(providerCapabilities)
      .where(
        and(
          eq(providerCapabilities.providerId, provider.id),
          eq(providerCapabilities.isActive, true)
        )
      );

    const activeCapabilities = caps.map((c) => c.capability);

    // Query published requests within distance
    const candidateRequests = await db
      .select({
        id: serviceRequests.id,
        customerId: serviceRequests.customerId,
        category: serviceRequests.category,
        requiredCapabilities: serviceRequests.requiredCapabilities,
        description: serviceRequests.description,
        location: serviceRequests.location,
        status: serviceRequests.status,
        currentRadiusKm: serviceRequests.currentRadiusKm,
        createdAt: serviceRequests.createdAt,
        expiresAt: serviceRequests.expiresAt,
        distanceMeters: sql<number>`ROUND(ST_Distance(${serviceRequests.location}, ST_GeogFromText(${pointWkt})))`,
      })
      .from(serviceRequests)
      .where(
        and(
          inArray(serviceRequests.status, ['PUBLISHED', 'OFFERS_RECEIVED', 'MATCHING']),
          sql`${serviceRequests.expiresAt} > NOW()`,
          sql`ST_DWithin(${serviceRequests.location}, ST_GeogFromText(${pointWkt}), ${radiusMeters})`
        )
      )
      .orderBy(sql`ST_Distance(${serviceRequests.location}, ST_GeogFromText(${pointWkt})) ASC`);

    // Fetch existing offers by this provider for candidate requests
    const candidateIds = candidateRequests.map((r) => r.id);
    const existingOffers = candidateIds.length > 0
      ? await db
          .select()
          .from(providerOffers)
          .where(
            and(
              eq(providerOffers.providerId, provider.id),
              inArray(providerOffers.requestId, candidateIds)
            )
          )
      : [];

    const offerMap = new Map(existingOffers.map((o) => [o.requestId, o]));

    // Filter by capability overlap
    return candidateRequests
      .filter((req) => {
        if (!req.requiredCapabilities || req.requiredCapabilities.length === 0) return true;
        return req.requiredCapabilities.some((cap) => activeCapabilities.includes(cap));
      })
      .map((req) => {
        const coords = parseGeographyPoint(req.location);
        const distanceKm = Number((req.distanceMeters / 1000).toFixed(1));
        const myOffer = offerMap.get(req.id);

        return {
          id: req.id,
          category: req.category,
          description: req.description,
          location: coords,
          distanceKm,
          status: req.status,
          createdAt: req.createdAt,
          expiresAt: req.expiresAt,
          myOffer: myOffer
            ? {
                id: myOffer.id,
                pricingMode: myOffer.pricingMode,
                amountTiyn: myOffer.amountTiyn,
                etaMinutes: myOffer.etaMinutes,
                message: myOffer.message,
                status: myOffer.status,
              }
            : null,
        };
      });
  }

  /**
   * Retrieves shift statistics, earned GMV, and completed order history for the master.
   */
  static async getShiftStats(currentUser: AuthUser) {
    const provider = await this.resolveProviderForUser(currentUser);

    // Completed orders by this provider
    const completedRows = await db
      .select({
        order: orders,
        customerUser: users,
        offer: providerOffers,
        request: serviceRequests,
      })
      .from(orders)
      .innerJoin(users, eq(orders.customerId, users.id))
      .innerJoin(providerOffers, eq(orders.offerId, providerOffers.id))
      .innerJoin(serviceRequests, eq(orders.requestId, serviceRequests.id))
      .where(
        and(
          eq(orders.providerId, provider.id),
          eq(orders.status, 'COMPLETED')
        )
      )
      .orderBy(desc(orders.updatedAt));

    // Reviews given to this provider
    const providerReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.toUserId, currentUser.id));

    // Reviews given by this provider to customers
    const myCustomerReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.fromUserId, currentUser.id));

    const customerReviewMap = new Map(myCustomerReviews.map((r) => [r.orderId, r]));
    const providerReviewMap = new Map(providerReviews.map((r) => [r.orderId, r]));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let todayGmvTiyn = 0;
    let totalGmvTiyn = 0;
    let todayOrdersCount = 0;

    const formattedOrders = completedRows.map((row) => {
      const amount = row.order.finalAmountTiyn || row.order.agreedAmountTiyn || 0;
      totalGmvTiyn += amount;

      if (new Date(row.order.updatedAt) >= todayStart) {
        todayGmvTiyn += amount;
        todayOrdersCount++;
      }

      return {
        id: row.order.id,
        category: row.request.category,
        description: row.request.description,
        location: parseGeographyPoint(row.request.location),
        customerPhone: row.customerUser.phone,
        finalAmountTiyn: amount,
        agreedPricingMode: row.order.agreedPricingMode,
        completedAt: row.order.updatedAt,
        receivedReview: providerReviewMap.get(row.order.id) || null,
        givenReview: customerReviewMap.get(row.order.id) || null,
      };
    });

    return {
      todayGmvTiyn,
      totalGmvTiyn,
      todayOrdersCount,
      totalCompletedJobs: completedRows.length,
      rating: provider.rating,
      orders: formattedOrders,
    };
  }
}
