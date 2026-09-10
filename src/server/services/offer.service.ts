import { eq, and } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  providerOffers,
  providers,
  serviceRequests,
} from '../../db/schema/index';
import { PricingMode } from '../../types';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../errors';
import { AuthUser } from '../auth';
import { ProviderEligibilityService } from './eligibility.service';

export interface CreateOfferInput {
  requestId: string;
  pricingMode: PricingMode;
  amountTiyn?: number;
  minAmountTiyn?: number;
  maxAmountTiyn?: number;
  etaMinutes: number;
  message?: string;
}

export class OfferService {
  /**
   * Submits a provider offer for a service request.
   *
   * Provider identity is strictly bound to currentUser.providerId.
   * Server-side eligibility is deterministically recomputed before insertion.
   */
  static async createOffer(input: CreateOfferInput, currentUser: AuthUser) {
    const {
      requestId,
      pricingMode,
      amountTiyn,
      minAmountTiyn,
      maxAmountTiyn,
      etaMinutes,
      message,
    } = input;

    // 1. Verify currentUser has an active provider profile
    if (!currentUser.providerId || !currentUser.roles.includes('provider')) {
      throw new ForbiddenError('Only registered service providers can submit offers');
    }

    if (currentUser.isBlocked) {
      throw new ForbiddenError('Provider account is blocked');
    }

    const providerId = currentUser.providerId;

    // 2. Comprehensive Server-Side Eligibility Recomputation
    // "Provider eligibility is recomputed server-side before offer submission."
    const { request } = await ProviderEligibilityService.assertEligible(providerId, requestId);

    // 3. Strict Pricing Integrity Validation
    if (pricingMode === 'fixed' || pricingMode === 'diagnostic_fee') {
      if (!amountTiyn || amountTiyn <= 0 || !Number.isInteger(amountTiyn)) {
        throw new ValidationError(
          `Pricing mode '${pricingMode}' requires a positive integer amount in tiyn`
        );
      }
      if (minAmountTiyn != null || maxAmountTiyn != null) {
        throw new ValidationError(
          `Pricing mode '${pricingMode}' must not contain min or max estimate amounts`
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
      if (amountTiyn != null) {
        throw new ValidationError(
          'Estimate range pricing must not contain a fixed amount in tiyn'
        );
      }
    } else {
      throw new ValidationError(`Invalid pricing mode '${pricingMode}'`);
    }

    // 4. Validate ETA
    if (!etaMinutes || etaMinutes < 1 || etaMinutes > 480 || !Number.isInteger(etaMinutes)) {
      throw new ValidationError('ETA must be an integer between 1 and 480 minutes');
    }

    // 5. Validate Message length
    if (message && message.length > 500) {
      throw new ValidationError('Offer message must not exceed 500 characters');
    }

    // 6. Check for Duplicate Offer
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

    // 7. Atomic Insert Offer & Update Request Status if PUBLISHED
    const now = new Date();
    return await db.transaction(async (tx) => {
      const [offer] = await tx
        .insert(providerOffers)
        .values({
          requestId,
          providerId,
          pricingMode,
          amountTiyn: pricingMode !== 'estimate_range' ? amountTiyn : null,
          minAmountTiyn: pricingMode === 'estimate_range' ? minAmountTiyn : null,
          maxAmountTiyn: pricingMode === 'estimate_range' ? maxAmountTiyn : null,
          etaMinutes,
          message: message ? message.trim() : null,
          status: 'SUBMITTED',
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (request.status === 'PUBLISHED') {
        await tx
          .update(serviceRequests)
          .set({ status: 'OFFERS_RECEIVED', updatedAt: now })
          .where(
            and(
              eq(serviceRequests.id, requestId),
              eq(serviceRequests.status, 'PUBLISHED')
            )
          );
      }

      return offer;
    });
  }

  static async getOffersForRequest(requestId: string, currentUser: AuthUser) {
    const [request] = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, requestId));

    if (!request) {
      throw new NotFoundError('Service request not found');
    }

    const isCustomerOwner = request.customerId === currentUser.id;
    const isAdmin = currentUser.roles.includes('admin');
    const isProvider = currentUser.roles.includes('provider') && !!currentUser.providerId;

    if (!isCustomerOwner && !isAdmin && !isProvider) {
      throw new ForbiddenError('You do not have permission to view offers for this request');
    }

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

    // If caller is a provider (and not customer owner/admin), return ONLY their own offer
    if (isProvider && !isCustomerOwner && !isAdmin) {
      const ownOffers = offersWithProviders.filter(
        (o) => o.providerId === currentUser.providerId
      );
      return ownOffers.map((o) => ({
        ...o,
        rating: Number(o.rating) / 100,
      }));
    }

    return offersWithProviders.map((o) => ({
      ...o,
      rating: Number(o.rating) / 100,
    }));
  }
}
