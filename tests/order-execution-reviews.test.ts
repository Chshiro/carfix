import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import {
  seedDatabase,
  SEED_CUSTOMER_ID,
  SEED_PROVIDER_1_ID,
  SEED_PROVIDER_2_ID,
} from '../src/db/seed';
import { RequestService } from '../src/server/services/request.service';
import { OfferService } from '../src/server/services/offer.service';
import { OrderService } from '../src/server/services/order.service';
import { ReviewService } from '../src/server/services/review.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../src/server/errors';
import { AuthUser, createAuthToken } from '../src/server/auth';
import { db } from '../src/db/client';
import { orders, providers, reviews, serviceRequests } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';

import { PATCH as updateStatusRoute } from '../src/app/api/orders/[id]/status/route';
import { GET as getHistoryRoute } from '../src/app/api/orders/[id]/history/route';
import { POST as createReviewRoute, GET as getReviewsRoute } from '../src/app/api/orders/[id]/reviews/route';

describe('Slice 2: Order Execution Lifecycle FSM & Bidirectional Reviews', () => {
  const customerUserId = SEED_CUSTOMER_ID;
  const provider1UserId = 'a1000000-0000-0000-0000-000000000001';
  const provider2UserId = 'a2000000-0000-0000-0000-000000000002';
  const unrelatedUserId = 'a4000000-0000-0000-0000-000000000004';

  const mockCustomer: AuthUser = {
    id: customerUserId,
    phone: '+77011112233',
    roles: ['motorist'],
    isBlocked: false,
  };

  const mockProvider1: AuthUser = {
    id: provider1UserId,
    phone: '+77021112233',
    roles: ['provider'],
    isBlocked: false,
    providerId: SEED_PROVIDER_1_ID,
  };

  const mockProvider2: AuthUser = {
    id: provider2UserId,
    phone: '+77031112233',
    roles: ['provider'],
    isBlocked: false,
    providerId: SEED_PROVIDER_2_ID,
  };

  let customerToken: string;
  let provider1Token: string;
  let provider2Token: string;
  let unrelatedToken: string;

  beforeAll(async () => {
    await seedDatabase();

    customerToken = await createAuthToken({ sub: customerUserId, phone: '+77011112233', roles: ['motorist'] });
    provider1Token = await createAuthToken({ sub: provider1UserId, phone: '+77021112233', roles: ['provider'] });
    provider2Token = await createAuthToken({ sub: provider2UserId, phone: '+77031112233', roles: ['provider'] });
    unrelatedToken = await createAuthToken({ sub: unrelatedUserId, phone: '+77051112233', roles: ['provider'] });
  });

  // -------------------------------------------------------------
  // 1. HAPPY PATH: FULL FSM EXECUTION & SETTLEMENT
  // -------------------------------------------------------------
  describe('1. Happy Path: Sequential FSM Transitions & Completion Settlement', () => {
    let orderId: string;
    let requestId: string;
    let initialCompletedJobs: number;

    it('Setup: Creates and selects offer to establish order in PROVIDER_SELECTED status', async () => {
      // 1. Get initial completed jobs for provider 1
      const [initialProv] = await db.select().from(providers).where(eq(providers.id, SEED_PROVIDER_1_ID));
      initialCompletedJobs = initialProv.completedJobs;

      // 2. Create request
      const reqRes = await RequestService.createRequest(
        { category: 'battery_jumpstart', location: { lat: 51.1283, lng: 71.4305 } },
        mockCustomer
      );
      requestId = reqRes.request.id;

      // 3. Create offer
      const offerRes = await OfferService.createOffer(
        { requestId, pricingMode: 'fixed', amountTiyn: 500000, etaMinutes: 15 },
        mockProvider1
      );

      // 4. Select offer
      const selectRes = await OrderService.selectOffer(
        { requestId, offerId: offerRes.id },
        mockCustomer
      );

      orderId = selectRes.order.id;
      expect(selectRes.order.status).toBe('PROVIDER_SELECTED');
    });

    it('Step 1: Provider 1 advances order to EN_ROUTE', async () => {
      const res = await OrderService.updateOrderStatus(
        orderId,
        { status: 'EN_ROUTE', note: 'Мастер выехал с базы' },
        mockProvider1
      );

      expect(res.order.status).toBe('EN_ROUTE');

      const [orderRow] = await db.select().from(orders).where(eq(orders.id, orderId));
      expect(orderRow.status).toBe('EN_ROUTE');

      const [reqRow] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, requestId));
      expect(reqRow.status).toBe('EN_ROUTE');
    });

    it('Step 2: Provider 1 advances order to ARRIVED', async () => {
      const res = await OrderService.updateOrderStatus(
        orderId,
        { status: 'ARRIVED', note: 'Прибыл на парковку у Байтерека' },
        mockProvider1
      );

      expect(res.order.status).toBe('ARRIVED');
    });

    it('Step 3: Provider 1 advances order to IN_PROGRESS', async () => {
      const res = await OrderService.updateOrderStatus(
        orderId,
        { status: 'IN_PROGRESS', note: 'Подключили пусковое устройство' },
        mockProvider1
      );

      expect(res.order.status).toBe('IN_PROGRESS');
    });

    it('Step 4: Provider 1 completes order with finalAmountTiyn settlement', async () => {
      const res = await OrderService.updateOrderStatus(
        orderId,
        { status: 'COMPLETED', finalAmountTiyn: 550000, note: 'Двигатель успешно запущен' },
        mockProvider1
      );

      expect(res.order.status).toBe('COMPLETED');
      expect(res.order.finalAmountTiyn).toBe(550000);

      // Verify Service Request is COMPLETED
      const [reqRow] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, requestId));
      expect(reqRow.status).toBe('COMPLETED');

      // Verify Provider completedJobs was incremented by exactly 1
      const [updatedProv] = await db.select().from(providers).where(eq(providers.id, SEED_PROVIDER_1_ID));
      expect(updatedProv.completedJobs).toBe(initialCompletedJobs + 1);
    });

    it('Audit History: Full timeline is recorded in order_status_history', async () => {
      const history = await OrderService.getOrderHistory(orderId, mockCustomer);
      expect(history.length).toBe(5);

      const statusSequence = history.map((h) => h.toStatus);
      expect(statusSequence).toEqual([
        'PROVIDER_SELECTED',
        'EN_ROUTE',
        'ARRIVED',
        'IN_PROGRESS',
        'COMPLETED',
      ]);

      expect(history[0].actorRole).toBe('motorist');
      expect(history[1].actorRole).toBe('provider');
      expect(history[4].actorRole).toBe('provider');
    });
  });

  // -------------------------------------------------------------
  // 2. FSM TRANSITION VIOLATIONS & ERROR HANDLING
  // -------------------------------------------------------------
  describe('2. FSM Invariant & Transition Violation Rejections', () => {
    let freshOrderId: string;

    beforeAll(async () => {
      const reqRes = await RequestService.createRequest(
        { category: 'electrical_starting', location: { lat: 51.1283, lng: 71.4305 } },
        mockCustomer
      );
      const offerRes = await OfferService.createOffer(
        { requestId: reqRes.request.id, pricingMode: 'fixed', amountTiyn: 600000, etaMinutes: 20 },
        mockProvider1
      );
      const selectRes = await OrderService.selectOffer(
        { requestId: reqRes.request.id, offerId: offerRes.id },
        mockCustomer
      );
      freshOrderId = selectRes.order.id;
    });

    it('Rejects skipping steps (PROVIDER_SELECTED -> ARRIVED) with 409 Conflict', async () => {
      await expect(
        OrderService.updateOrderStatus(freshOrderId, { status: 'ARRIVED' }, mockProvider1)
      ).rejects.toThrow(ConflictError);
    });

    it('Rejects skipping steps (PROVIDER_SELECTED -> COMPLETED) with 409 Conflict', async () => {
      await expect(
        OrderService.updateOrderStatus(
          freshOrderId,
          { status: 'COMPLETED', finalAmountTiyn: 600000 },
          mockProvider1
        )
      ).rejects.toThrow(ConflictError);
    });

    it('Rejects unauthorized actor (Customer trying to set EN_ROUTE) with 403 Forbidden', async () => {
      await expect(
        OrderService.updateOrderStatus(freshOrderId, { status: 'EN_ROUTE' }, mockCustomer)
      ).rejects.toThrow(ForbiddenError);
    });

    it('Rejects unrelated provider (Provider 2 trying to advance Provider 1 order) with 403 Forbidden', async () => {
      await expect(
        OrderService.updateOrderStatus(freshOrderId, { status: 'EN_ROUTE' }, mockProvider2)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  // -------------------------------------------------------------
  // 3. CANCELLATION LIFECYCLE
  // -------------------------------------------------------------
  describe('3. Order Cancellation Lifecycle & Safeguards', () => {
    let orderToCancelId: string;
    let cancelRequestId: string;

    beforeAll(async () => {
      const reqRes = await RequestService.createRequest(
        { category: 'battery_jumpstart', location: { lat: 51.1283, lng: 71.4305 } },
        mockCustomer
      );
      cancelRequestId = reqRes.request.id;

      const offerRes = await OfferService.createOffer(
        { requestId: cancelRequestId, pricingMode: 'fixed', amountTiyn: 800000, etaMinutes: 25 },
        mockProvider1
      );
      const selectRes = await OrderService.selectOffer(
        { requestId: cancelRequestId, offerId: offerRes.id },
        mockCustomer
      );
      orderToCancelId = selectRes.order.id;
    });

    it('Rejects cancellation without a reason with 409 Conflict', async () => {
      await expect(
        OrderService.updateOrderStatus(
          orderToCancelId,
          { status: 'CANCELLED', cancellationReason: '' },
          mockCustomer
        )
      ).rejects.toThrow(ConflictError);
    });

    it('Customer successfully cancels order with reason before work starts', async () => {
      const res = await OrderService.updateOrderStatus(
        orderToCancelId,
        { status: 'CANCELLED', cancellationReason: 'Машина завелась сама, помощь не требуется' },
        mockCustomer
      );

      expect(res.order.status).toBe('CANCELLED');
      expect(res.order.cancellationReason).toBe('Машина завелась сама, помощь не требуется');
      expect(res.order.cancelledBy).toBe(customerUserId);

      // Verify request is also CANCELLED
      const [reqRow] = await db.select().from(serviceRequests).where(eq(serviceRequests.id, cancelRequestId));
      expect(reqRow.status).toBe('CANCELLED');
    });

    it('Rejects any further status progression on CANCELLED order with 409 Conflict', async () => {
      await expect(
        OrderService.updateOrderStatus(orderToCancelId, { status: 'EN_ROUTE' }, mockProvider1)
      ).rejects.toThrow(ConflictError);
    });
  });

  // -------------------------------------------------------------
  // 4. BIDIRECTIONAL REVIEWS & RATING RECALCULATION
  // -------------------------------------------------------------
  describe('4. Bidirectional Review Rating System', () => {
    let completedOrderId: string;

    beforeAll(async () => {
      // Create a fresh completed order
      const reqRes = await RequestService.createRequest(
        { category: 'battery_jumpstart', location: { lat: 51.1283, lng: 71.4305 } },
        mockCustomer
      );
      const offerRes = await OfferService.createOffer(
        { requestId: reqRes.request.id, pricingMode: 'fixed', amountTiyn: 500000, etaMinutes: 10 },
        mockProvider1
      );
      const selectRes = await OrderService.selectOffer(
        { requestId: reqRes.request.id, offerId: offerRes.id },
        mockCustomer
      );
      completedOrderId = selectRes.order.id;

      // Advance through FSM to COMPLETED
      await OrderService.updateOrderStatus(completedOrderId, { status: 'EN_ROUTE' }, mockProvider1);
      await OrderService.updateOrderStatus(completedOrderId, { status: 'ARRIVED' }, mockProvider1);
      await OrderService.updateOrderStatus(completedOrderId, { status: 'IN_PROGRESS' }, mockProvider1);
      await OrderService.updateOrderStatus(
        completedOrderId,
        { status: 'COMPLETED', finalAmountTiyn: 500000 },
        mockProvider1
      );
    });

    it('Rejects review on an uncompleted order with 409 Conflict', async () => {
      // Create an uncompleted order
      const reqRes = await RequestService.createRequest(
        { category: 'battery_jumpstart', location: { lat: 51.1283, lng: 71.4305 } },
        mockCustomer
      );
      const offerRes = await OfferService.createOffer(
        { requestId: reqRes.request.id, pricingMode: 'fixed', amountTiyn: 500000, etaMinutes: 10 },
        mockProvider1
      );
      const selectRes = await OrderService.selectOffer(
        { requestId: reqRes.request.id, offerId: offerRes.id },
        mockCustomer
      );

      await expect(
        ReviewService.createReview(selectRes.order.id, { rating: 5, comment: 'Great!' }, mockCustomer)
      ).rejects.toThrow(ConflictError);
    });

    it('Rejects review from unrelated third party with 403 Forbidden', async () => {
      const mockUnrelated: AuthUser = {
        id: unrelatedUserId,
        phone: '+77051112233',
        roles: ['motorist'],
        isBlocked: false,
      };

      await expect(
        ReviewService.createReview(completedOrderId, { rating: 5, comment: 'Spam review' }, mockUnrelated)
      ).rejects.toThrow(ForbiddenError);
    });

    it('Customer submits 5-star review for Master -> updates Provider rating', async () => {
      const review = await ReviewService.createReview(
        completedOrderId,
        { rating: 5, comment: 'Отличный мастер Азамат, приехал за 10 минут!' },
        mockCustomer
      );

      expect(review.rating).toBe(5);
      expect(review.fromUserId).toBe(customerUserId);
      expect(review.toUserId).toBe(provider1UserId);

      // Verify Provider aggregate rating in DB
      const [prov] = await db.select().from(providers).where(eq(providers.id, SEED_PROVIDER_1_ID));
      expect(prov.rating).toBeGreaterThanOrEqual(400); // 4.00 - 5.00
    });

    it('Rejects duplicate review from Customer for the same order with 409 Conflict', async () => {
      await expect(
        ReviewService.createReview(
          completedOrderId,
          { rating: 4, comment: 'Trying to review again' },
          mockCustomer
        )
      ).rejects.toThrow(ConflictError);
    });

    it('Provider submits review for Customer -> succeeds', async () => {
      const review = await ReviewService.createReview(
        completedOrderId,
        { rating: 5, comment: 'Вежливый клиент, оплата сразу' },
        mockProvider1
      );

      expect(review.rating).toBe(5);
      expect(review.fromUserId).toBe(provider1UserId);
      expect(review.toUserId).toBe(customerUserId);
    });

    it('Lists all reviews for order via ReviewService.getReviewsForOrder', async () => {
      const orderReviews = await ReviewService.getReviewsForOrder(completedOrderId, mockCustomer);
      expect(orderReviews.length).toBe(2);
    });
  });

  // -------------------------------------------------------------
  // 5. HTTP API ENDPOINTS INTEGRATION
  // -------------------------------------------------------------
  describe('5. HTTP API Route Endpoints', () => {
    let httpOrderId: string;

    beforeAll(async () => {
      const reqRes = await RequestService.createRequest(
        { category: 'battery_jumpstart', location: { lat: 51.1283, lng: 71.4305 } },
        mockCustomer
      );
      const offerRes = await OfferService.createOffer(
        { requestId: reqRes.request.id, pricingMode: 'fixed', amountTiyn: 500000, etaMinutes: 10 },
        mockProvider1
      );
      const selectRes = await OrderService.selectOffer(
        { requestId: reqRes.request.id, offerId: offerRes.id },
        mockCustomer
      );
      httpOrderId = selectRes.order.id;
    });

    it('PATCH /api/orders/[id]/status rejects non-UUID id with 400 VALIDATION_ERROR', async () => {
      const req = new NextRequest('http://localhost:3000/api/orders/not-a-uuid/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider1Token}` },
        body: JSON.stringify({ status: 'EN_ROUTE' }),
      });

      const res = await updateStatusRoute(req, { params: { id: 'not-a-uuid' } });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('PATCH /api/orders/[id]/status advances order via HTTP', async () => {
      const req = new NextRequest(`http://localhost:3000/api/orders/${httpOrderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider1Token}` },
        body: JSON.stringify({ status: 'EN_ROUTE', note: 'Выехал через HTTP API' }),
      });

      const res = await updateStatusRoute(req, { params: { id: httpOrderId } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.data.order.status).toBe('EN_ROUTE');
    });

    it('GET /api/orders/[id]/history returns timeline via HTTP', async () => {
      const req = new NextRequest(`http://localhost:3000/api/orders/${httpOrderId}/history`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${customerToken}` },
      });

      const res = await getHistoryRoute(req, { params: { id: httpOrderId } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('POST /api/orders/[id]/reviews rejects invalid rating (< 1 or > 5) with 400 VALIDATION_ERROR', async () => {
      const req = new NextRequest(`http://localhost:3000/api/orders/${httpOrderId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
        body: JSON.stringify({ rating: 10, comment: 'Invalid rating' }),
      });

      const res = await createReviewRoute(req, { params: { id: httpOrderId } });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });
});
