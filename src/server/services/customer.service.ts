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
  demoCode?: string;
}

export const KZ_DEF_REGEX = /^\+7(700|701|702|705|706|707|708|709|747|771|775|776|777|778)\d{7}$/;

interface OtpRecord {
  code: string;
  expiresAt: number;
}

const otpStore = new Map<string, OtpRecord>();

export class CustomerService {
  /**
   * Normalizes Kazakhstan phone numbers into E.164-like format +77XXXXXXXXX
   * and verifies national mobile DEF codes.
   */
  static normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      throw new ValidationError('Номер телефона должен содержать не менее 10 цифр');
    }

    let normalized: string;
    if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
      normalized = `+7${digits.slice(1)}`;
    } else if (digits.length === 10) {
      normalized = `+7${digits}`;
    } else if (digits.startsWith('7') && digits.length === 11) {
      normalized = `+${digits}`;
    } else {
      normalized = `+${digits}`;
    }

    if (!KZ_DEF_REGEX.test(normalized)) {
      throw new ValidationError(
        'Номер телефона должен принадлежать мобильному оператору Казахстана (+7 7xx xxx xx xx)'
      );
    }

    return normalized;
  }

  /**
   * Requests a 4-digit OTP code for phone authentication.
   * TTL: 5 minutes. In test/dev environment, default code is '1111'.
   */
  static async requestOtp(rawPhone: string): Promise<RequestOtpResult> {
    if (!rawPhone || typeof rawPhone !== 'string') {
      throw new ValidationError('Номер телефона обязателен для получения кода');
    }

    const phone = this.normalizePhone(rawPhone);
    const isNonProd = env.NODE_ENV !== 'production' || env.DEMO_MODE === 'true';
    const code = isNonProd ? '1111' : Math.floor(1000 + Math.random() * 9000).toString();
    const expiresInSeconds = 300;

    otpStore.set(phone, {
      code,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    });

    return {
      message: 'Код подтверждения отправлен по SMS',
      expiresInSeconds,
      ...(isNonProd ? { demoCode: code } : {}),
    };
  }

  /**
   * Verifies 4-digit OTP code and returns authenticated session token.
   */
  static async verifyOtp(rawPhone: string, code: string): Promise<PhoneLoginResult> {
    if (!rawPhone || typeof rawPhone !== 'string') {
      throw new ValidationError('Номер телефона обязателен');
    }

    if (!code || typeof code !== 'string' || code.trim().length !== 4) {
      throw new ValidationError('Код подтверждения должен состоять из 4 цифр');
    }

    const phone = this.normalizePhone(rawPhone);
    const stored = otpStore.get(phone);
    const isNonProd = env.NODE_ENV !== 'production' || env.DEMO_MODE === 'true';

    const isValid =
      (stored && stored.code === code.trim() && stored.expiresAt > Date.now()) ||
      (isNonProd && code.trim() === '1111');

    if (!isValid) {
      throw new UnauthorizedError('Неверный или просроченный код подтверждения');
    }

    otpStore.delete(phone);

    // Look up user by phone
    let [user] = await db.select().from(users).where(eq(users.phone, phone));

    if (!user) {
      // Create new motorist user
      const [newUser] = await db
        .insert(users)
        .values({
          phone,
          roles: ['motorist'],
          isBlocked: false,
        })
        .returning();
      user = newUser;
    }

    if (user.isBlocked) {
      throw new ForbiddenError('Учетная запись заблокирована администратором');
    }

    const token = await createAuthToken({
      sub: user.id,
      phone: user.phone,
      roles: user.roles,
    });

    return {
      token,
      user: {
        id: user.id,
        phone: user.phone,
        roles: user.roles,
      },
    };
  }

  /**
   * Phone authentication for motorists.
   * If code is provided, verifies OTP. In test/dev environment, allows default '1111'.
   */
  static async phoneLogin(rawPhone: string, code?: string): Promise<PhoneLoginResult> {
    const isNonProd = env.NODE_ENV !== 'production' || env.DEMO_MODE === 'true';
    const otpCode = code || (isNonProd ? '1111' : undefined);

    if (!otpCode) {
      throw new ValidationError('Код подтверждения обязателен');
    }

    return await this.verifyOtp(rawPhone, otpCode);
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
