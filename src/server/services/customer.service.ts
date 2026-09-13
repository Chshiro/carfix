import { eq, and, or, inArray, desc, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  users,
  serviceRequests,
  providerOffers,
  providers,
  orders,
  reviews,
  parseGeographyPoint,
} from '../../db/schema/index';
import { createAuthToken, AuthUser } from '../auth';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../errors';

import { env } from '../../lib/env';

import { AuthService } from './auth.service';
import { normalizeKzPhone, validateKzPhone, KZ_MOBILE_PREFIXES } from '../auth/phone';

export interface PhoneLoginResult {
  token: string;
  user: {
    id: string;
    phone: string;
    roles: string[];
  };
}

export interface RequestOtpResult {
  message: string;
  expiresInSeconds: number;
  retryAfter?: number;
  demoCode?: string;
}

export class CustomerService {
  /**
   * Normalizes Kazakhstan phone numbers into E.164-like format +77XXXXXXXXX
   */
  static normalizePhone(phone: string): string {
    return normalizeKzPhone(phone);
  }

  /**
   * Requests a 6-digit OTP code for phone authentication via AuthService.
   */
  static async requestOtp(rawPhone: string, clientIp: string = '127.0.0.1'): Promise<RequestOtpResult> {
    const result = await AuthService.requestOtp(rawPhone, clientIp);
    return {
      message: 'Код подтверждения отправлен по SMS',
      expiresInSeconds: result.expiresInSeconds,
      retryAfter: result.retryAfter,
      demoCode: result.demoCode,
    };
  }

  /**
   * Verifies OTP code and returns authenticated session token.
   */
  static async verifyOtp(rawPhone: string, code: string, clientIp: string = '127.0.0.1'): Promise<PhoneLoginResult> {
    const result = await AuthService.verifyOtp(rawPhone, code, clientIp);
    const token = await createAuthToken({
      sub: result.user.id,
      phone: result.user.phone,
      roles: result.user.roles,
    });

    return {
      token,
      user: {
        id: result.user.id,
        phone: result.user.phone,
        roles: result.user.roles,
      },
    };
  }

  /**
   * Phone authentication for motorists.
   */
  static async phoneLogin(rawPhone: string, code?: string, clientIp: string = '127.0.0.1'): Promise<PhoneLoginResult> {
    const isNonProd = env.NODE_ENV !== 'production' || env.DEMO_MODE === 'true';
    const otpCode = code || (isNonProd ? '123456' : undefined);

    if (!otpCode) {
      throw new ValidationError('Код подтверждения обязателен');
    }

    // In dev / demo convenience login, ensure an active challenge exists before verifying
    if (isNonProd) {
      try {
        await AuthService.requestOtp(rawPhone, clientIp);
      } catch {
        // Lingering challenge or cooldown is safe to proceed to verification
      }
    }

    return await this.verifyOtp(rawPhone, otpCode, clientIp);
  }


  /**
   * Retrieves current active customer state (active request or in-progress/completed order).
   * Used for seamless hydration on page load / reload (F5).
   */
  static async getActiveState(currentUser: AuthUser) {
    if (currentUser.isBlocked) {
      throw new ForbiddenError('Учетная запись заблокирована');
    }

    const customerId = currentUser.id;

    // 1. Check for Active / In-Progress / Recently Completed Order
    const activeStatuses = [
      'PROVIDER_SELECTED',
      'CONFIRMED',
      'EN_ROUTE',
      'ARRIVED',
      'IN_PROGRESS',
      'PAYMENT_PENDING',
    ];

    const activeOrders = await db
      .select({
        order: orders,
        provider: providers,
        providerUser: users,
        offer: providerOffers,
        request: serviceRequests,
      })
      .from(orders)
      .innerJoin(providers, eq(orders.providerId, providers.id))
      .innerJoin(users, eq(providers.userId, users.id))
      .innerJoin(providerOffers, eq(orders.offerId, providerOffers.id))
      .innerJoin(serviceRequests, eq(orders.requestId, serviceRequests.id))
      .where(
        and(
          eq(orders.customerId, customerId),
          or(
            inArray(orders.status, activeStatuses),
            and(
              eq(orders.status, 'COMPLETED'),
              sql`${orders.updatedAt} >= NOW() - INTERVAL '24 hours'`
            )
          )
        )
      )
      .orderBy(desc(orders.updatedAt))
      .limit(1);

    if (activeOrders.length > 0) {
      const row = activeOrders[0];

      // Check if customer already submitted review for this order
      const [existingReview] = await db
        .select()
        .from(reviews)
        .where(
          and(
            eq(reviews.orderId, row.order.id),
            eq(reviews.fromUserId, customerId)
          )
        );

      return {
        type: 'ORDER' as const,
        order: {
          id: row.order.id,
          status: row.order.status,
          agreedPricingMode: row.order.agreedPricingMode,
          agreedAmountTiyn: row.order.agreedAmountTiyn,
          agreedMinTiyn: row.order.agreedMinTiyn,
          agreedMaxTiyn: row.order.agreedMaxTiyn,
          finalAmountTiyn: row.order.finalAmountTiyn,
          cancellationReason: row.order.cancellationReason,
          createdAt: row.order.createdAt,
          updatedAt: row.order.updatedAt,
        },
        provider: {
          id: row.provider.id,
          businessName: row.provider.businessName,
          providerType: row.provider.providerType,
          rating: row.provider.rating,
          completedJobs: row.provider.completedJobs,
          phone: row.providerUser.phone,
        },
        offer: {
          id: row.offer.id,
          pricingMode: row.offer.pricingMode,
          amountTiyn: row.offer.amountTiyn,
          minAmountTiyn: row.offer.minAmountTiyn,
          maxAmountTiyn: row.offer.maxAmountTiyn,
          etaMinutes: row.offer.etaMinutes,
          message: row.offer.message,
        },
        request: {
          id: row.request.id,
          category: row.request.category,
          description: row.request.description,
          location: parseGeographyPoint(row.request.location),
          status: row.request.status,
          createdAt: row.request.createdAt,
        },
        reviewSubmitted: !!existingReview,
        review: existingReview || null,
      };
    }

    // 2. If no active order, check for Active Service Request (PUBLISHED / OFFERS_RECEIVED / MATCHING)
    const activeRequests = await db
      .select()
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.customerId, customerId),
          inArray(serviceRequests.status, ['PUBLISHED', 'OFFERS_RECEIVED', 'MATCHING']),
          sql`${serviceRequests.expiresAt} > NOW()`
        )
      )
      .orderBy(desc(serviceRequests.createdAt))
      .limit(1);

    if (activeRequests.length > 0) {
      const activeReq = activeRequests[0];

      // Fetch submitted offers for this request
      const offersList = await db
        .select({
          offer: providerOffers,
          provider: providers,
        })
        .from(providerOffers)
        .innerJoin(providers, eq(providerOffers.providerId, providers.id))
        .where(
          and(
            eq(providerOffers.requestId, activeReq.id),
            eq(providerOffers.status, 'SUBMITTED')
          )
        )
        .orderBy(desc(providerOffers.createdAt));

      return {
        type: 'REQUEST' as const,
        request: {
          id: activeReq.id,
          category: activeReq.category,
          description: activeReq.description,
          location: parseGeographyPoint(activeReq.location),
          status: activeReq.status,
          currentRadiusKm: activeReq.currentRadiusKm,
          createdAt: activeReq.createdAt,
          expiresAt: activeReq.expiresAt,
        },
        offers: offersList.map((item) => ({
          id: item.offer.id,
          providerId: item.provider.id,
          businessName: item.provider.businessName,
          providerType: item.provider.providerType,
          verificationLevel: item.provider.verificationLevel,
          rating: item.provider.rating,
          completedJobs: item.provider.completedJobs,
          pricingMode: item.offer.pricingMode,
          amountTiyn: item.offer.amountTiyn,
          minAmountTiyn: item.offer.minAmountTiyn,
          maxAmountTiyn: item.offer.maxAmountTiyn,
          etaMinutes: item.offer.etaMinutes,
          message: item.offer.message,
          status: item.offer.status,
          createdAt: item.offer.createdAt,
        })),
      };
    }

    return {
      type: 'IDLE' as const,
      message: 'No active requests or orders',
    };
  }

  /**
   * Retrieves order history for the customer with receipt & review details.
   */
  static async getCustomerOrders(currentUser: AuthUser) {
    if (currentUser.isBlocked) {
      throw new ForbiddenError('Учетная запись заблокирована');
    }

    const orderRows = await db
      .select({
        order: orders,
        provider: providers,
        providerUser: users,
        offer: providerOffers,
        request: serviceRequests,
      })
      .from(orders)
      .innerJoin(providers, eq(orders.providerId, providers.id))
      .innerJoin(users, eq(providers.userId, users.id))
      .innerJoin(providerOffers, eq(orders.offerId, providerOffers.id))
      .innerJoin(serviceRequests, eq(orders.requestId, serviceRequests.id))
      .where(eq(orders.customerId, currentUser.id))
      .orderBy(desc(orders.createdAt));

    // Get all reviews authored by this user
    const userReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.fromUserId, currentUser.id));

    const reviewMap = new Map(userReviews.map((r) => [r.orderId, r]));

    return orderRows.map((row) => ({
      id: row.order.id,
      requestId: row.request.id,
      status: row.order.status,
      category: row.request.category,
      description: row.request.description,
      location: parseGeographyPoint(row.request.location),
      agreedPricingMode: row.order.agreedPricingMode,
      agreedAmountTiyn: row.order.agreedAmountTiyn,
      agreedMinTiyn: row.order.agreedMinTiyn,
      agreedMaxTiyn: row.order.agreedMaxTiyn,
      finalAmountTiyn: row.order.finalAmountTiyn,
      cancellationReason: row.order.cancellationReason,
      provider: {
        id: row.provider.id,
        businessName: row.provider.businessName,
        providerType: row.provider.providerType,
        rating: row.provider.rating,
        phone: row.providerUser.phone,
      },
      review: reviewMap.get(row.order.id) || null,
      createdAt: row.order.createdAt,
      updatedAt: row.order.updatedAt,
    }));
  }
}
