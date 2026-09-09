import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  providerOffers,
  providers,
  serviceRequests,
  users,
  providerCapabilities,
  providerAvailability,
} from '../../db/schema/index';
import { PricingMode } from '../../types';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../errors';

export interface CreateOfferInput {
  requestId: string;
  providerId: string;
  pricingMode: PricingMode;
  amountTiyn?: number;
  minAmountTiyn?: number;
  maxAmountTiyn?: number;
  etaMinutes: number;
  message?: string;
}

export class OfferService {
  static async createOffer(input: CreateOfferInput) {
    const {
      requestId,
      providerId,
      pricingMode,
      amountTiyn,
      minAmountTiyn,
      maxAmountTiyn,
      etaMinutes,
      message,
    } = input;

    // 1. Verify Provider exists and is not blocked
    const [provider] = await db
      .select()
      .from(providers)
      .where(eq(providers.id, providerId));

    if (!provider) {
      throw new NotFoundError('Provider not found');
    }

    const [providerUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, provider.userId));

    if (!providerUser || providerUser.isBlocked) {
      throw new ForbiddenError('Provider account is blocked or inactive');
    }

    // 2. Verify Request exists and is active
    const [request] = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, requestId));

    if (!request) {
      throw new NotFoundError('Service request not found');
    }

    if (request.status !== 'PUBLISHED' && request.status !== 'OFFERS_RECEIVED') {
      throw new ConflictError(
        `Cannot submit offer: request is in status '${request.status}'`
      );
    }

    if (new Date(request.expiresAt).getTime() <= Date.now()) {
      throw new ConflictError('Cannot submit offer: request has expired');
    }

    // 3. Verify Provider Capability Eligibility (OR semantics)
    const capabilities = await db
      .select()
      .from(providerCapabilities)
      .where(
        and(
          eq(providerCapabilities.providerId, providerId),
          eq(providerCapabilities.isActive, true)
        )
      );

    const hasMatchingCapability = capabilities.some((c) =>
      request.requiredCapabilities.includes(c.capability)
    );

    if (!hasMatchingCapability) {
      throw new ForbiddenError(
        'Provider does not have the required capabilities for this request'
      );
    }

    // 4. Validate Pricing Mode and amounts in tiyn
    if (pricingMode === 'fixed' || pricingMode === 'diagnostic_fee') {
      if (!amountTiyn || amountTiyn <= 0 || !Number.isInteger(amountTiyn)) {
        throw new ValidationError(
          `Pricing mode '${pricingMode}' requires a positive integer amount in tiyn`
        );
      }
    } else if (pricingMode === 'estimate_range') {
      if (
        !minAmountTiyn ||
        !maxAmountTiyn ||
        minAmountTiyn <= 0 ||
        maxAmountTiyn < minAmountTiyn ||
        !Number.isInteger(minAmountTiyn) ||
        !Number.isInteger(maxAmountTiyn)
      ) {
        throw new ValidationError(
          'Estimate range requires positive integer min and max amounts in tiyn where max >= min'
        );
      }
    } else {
      throw new ValidationError(`Invalid pricing mode '${pricingMode}'`);
    }

    // 5. Validate ETA
    if (!etaMinutes || etaMinutes <= 0 || etaMinutes > 480 || !Number.isInteger(etaMinutes)) {
      throw new ValidationError('ETA must be an integer between 1 and 480 minutes (8 hours max)');
    }

    // 6. Check for duplicate offer
    const [existingOffer] = await db
      .select()
      .from(providerOffers)
      .where(
        and(
          eq(providerOffers.requestId, requestId),
          eq(providerOffers.providerId, providerId)
        )
      );

    if (existingOffer) {
      throw new ConflictError('Provider has already submitted an offer for this request');
    }

    // 7. Insert Offer & update request status to OFFERS_RECEIVED if needed
    const now = new Date();
    const [offer] = await db
      .insert(providerOffers)
      .values({
        requestId,
        providerId,
        pricingMode,
        amountTiyn: amountTiyn || null,
        minAmountTiyn: minAmountTiyn || null,
        maxAmountTiyn: maxAmountTiyn || null,
        etaMinutes,
        message: message || null,
        status: 'SUBMITTED',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (request.status === 'PUBLISHED') {
      await db
        .update(serviceRequests)
        .set({ status: 'OFFERS_RECEIVED', updatedAt: now })
        .where(eq(serviceRequests.id, requestId));
    }

    return offer;
  }

  static async getOffersForRequest(requestId: string, requestingUserId: string) {
    const [request] = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, requestId));

    if (!request) {
      throw new NotFoundError('Service request not found');
    }

    // Anti-IDOR check: customer who owns the request, or check if user is admin or provider
    const [requestingUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, requestingUserId));

    const isCustomerOwner = request.customerId === requestingUserId;
    const isAdmin = requestingUser?.roles?.includes('admin');

    // Fetch offers joined with provider details
    const offersWithProviders = await db
      .select({
        id: providerOffers.id,
        requestId: providerOffers.requestId,
        providerId: providerOffers.providerId,
        businessName: providers.businessName,
        providerType: providers.providerType,
        verificationLevel: providers.verificationLevel,
        rating: providers.rating,
        completedJobs: providers.completedJobs,
        pricingMode: providerOffers.pricingMode,
        amountTiyn: providerOffers.amountTiyn,
        minAmountTiyn: providerOffers.minAmountTiyn,
        maxAmountTiyn: providerOffers.maxAmountTiyn,
        etaMinutes: providerOffers.etaMinutes,
        message: providerOffers.message,
        status: providerOffers.status,
        createdAt: providerOffers.createdAt,
      })
      .from(providerOffers)
      .innerJoin(providers, eq(providers.id, providerOffers.providerId))
      .where(eq(providerOffers.requestId, requestId));

    if (!isCustomerOwner && !isAdmin) {
      // If a provider is requesting, only return their own offer
      const [provider] = await db
        .select()
        .from(providers)
        .where(eq(providers.userId, requestingUserId));

      if (!provider) {
        throw new ForbiddenError('You do not have permission to view offers for this request');
      }

      return offersWithProviders.filter((o) => o.providerId === provider.id);
    }

    return offersWithProviders.map((o) => ({
      ...o,
      rating: Number(o.rating) / 100,
    }));
  }
}
