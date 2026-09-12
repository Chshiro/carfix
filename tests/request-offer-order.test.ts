import { describe, it, expect, beforeAll } from 'vitest';
import {
  seedDatabase,
  SEED_CUSTOMER_ID,
  SEED_PROVIDER_1_ID,
  SEED_PROVIDER_2_ID,
  SEED_PROVIDER_3_ID,
  SEED_PROVIDER_4_ID,
  SEED_PROVIDER_FAR_ID,
  SEED_PROVIDER_OFFLINE_ID,
  SEED_PROVIDER_BLOCKED_ID,
} from '../src/db/seed';
import { RequestService } from '../src/server/services/request.service';
import { MatchingService } from '../src/server/services/matching.service';
import { OfferService } from '../src/server/services/offer.service';
import { OrderService } from '../src/server/services/order.service';
import { ConflictError, ForbiddenError } from '../src/server/errors';
import { db } from '../src/db/client';
import {
  providerOffers,
  orders,
  users,
  providers,
  providerAvailability,
  providerCapabilities,
  providerServiceModes,
  reviews,
  vehicles,
  serviceRequests,
  parseGeographyPoint,
} from '../src/db/schema/index';
import { eq } from 'drizzle-orm';
import { AuthUser } from '../src/server/auth';

const mockCustomer: AuthUser = {
  id: SEED_CUSTOMER_ID,
  phone: '+77011112233',
  roles: ['motorist'],
  isBlocked: false,
};

const mockProvider1: AuthUser = {
  id: 'a1000000-0000-0000-0000-000000000001',
  phone: '+77021112233',
  roles: ['provider'],
  isBlocked: false,
  providerId: SEED_PROVIDER_1_ID,
};

const mockProvider2: AuthUser = {
  id: 'a2000000-0000-0000-0000-000000000002',
  phone: '+77031112233',
  roles: ['provider'],
  isBlocked: false,
  providerId: SEED_PROVIDER_2_ID,
};

const mockProvider4: AuthUser = {
  id: 'a4000000-0000-0000-0000-000000000004',
  phone: '+77051112233',
  roles: ['provider'],
  isBlocked: false,
  providerId: SEED_PROVIDER_4_ID,
};

describe('CarFix Vertical Slice: Request → Offer → Selection → Order', () => {
  beforeAll(async () => {
    await seedDatabase();
  });

  let createdRequestId: string;

  // 1. Request Creation Without Vehicle
  it('1. Creates a valid ServiceRequest without vehicle (vehicleId = null)', async () => {
    const result = await RequestService.createRequest(
      {
        category: 'electrical_starting',
        location: { lat: 51.1283, lng: 71.4305 }, // Astana Baiterek
        description: 'Не заводится, стартер щелкает',
      },
      mockCustomer
    );

    expect(result.request).toBeDefined();
    expect(result.request.id).toBeDefined();
    expect(result.request.customerId).toBe(mockCustomer.id);
    expect(result.request.vehicleId).toBeNull();
    expect(result.request.status).toBe('PUBLISHED');
    expect(result.request.category).toBe('electrical_starting');
    expect(result.request.requiredCapabilities).toEqual(['AUTO_ELECTRIC', 'DIAGNOSTICS']);
    expect(result.matchedProvidersCount).toBeGreaterThanOrEqual(1);

    createdRequestId = result.request.id;
  });

  // 1b. Vehicle Ownership Validation
  it('1b. Rejects attaching a vehicle that belongs to another customer (403 Forbidden)', async () => {
    const otherUserId = 'e8880000-0000-0000-0000-000000000088';
    await db.insert(users).values({
      id: otherUserId,
      phone: '+77088888888',
      roles: ['motorist'],
      isBlocked: false,
    });

    const [otherVehicle] = await db
      .insert(vehicles)
      .values({
        userId: otherUserId,
        make: 'BMW',
        model: 'X5',
        year: 2020,
      })
      .returning();

    await expect(
      RequestService.createRequest(
        {
          category: 'battery_jumpstart',
          location: { lat: 51.1283, lng: 71.4305 },
          vehicleId: otherVehicle.id,
        },
        mockCustomer
      )
    ).rejects.toThrow(ForbiddenError);
  });

  // 2. Spatial & Capability Matching (OR Semantics)
  it('2. Matches eligible nearby providers and applies capability OR semantics', async () => {
    const matched = await MatchingService.findMatchingProviders(
      { lat: 51.1283, lng: 71.4305 },
      ['AUTO_ELECTRIC', 'DIAGNOSTICS'],
      5
    );

    const providerIds = matched.map((p) => p.providerId);

    // Provider 1 (AUTO_ELECTRIC + BATTERY, ~1.1 km) should match
    expect(providerIds).toContain(SEED_PROVIDER_1_ID);

    // Provider 2 (AUTO_ELECTRIC + DIAGNOSTICS, ~2.3 km) should match
    expect(providerIds).toContain(SEED_PROVIDER_2_ID);

    // Provider 5 (AUTO_ELECTRIC + MECHANICAL_MINOR, ~1.9 km) should match
    expect(providerIds).toContain('b5000000-0000-0000-0000-000000000005');

    // Provider 3 (BATTERY only) should NOT match electrical_starting
    expect(providerIds).not.toContain(SEED_PROVIDER_3_ID);

    // Provider 4 (MECHANICAL_MINOR only) should NOT match electrical_starting
    expect(providerIds).not.toContain(SEED_PROVIDER_4_ID);
  });

  // 3. Offline Provider Excluded
  it('3. Excludes offline provider from matching', async () => {
    const matched = await MatchingService.findMatchingProviders(
      { lat: 51.1283, lng: 71.4305 },
      ['AUTO_ELECTRIC'],
      10
    );
    const providerIds = matched.map((p) => p.providerId);
    expect(providerIds).not.toContain(SEED_PROVIDER_OFFLINE_ID);
  });

  // 4. Stale Provider Location Excluded
  it('4. Excludes provider with stale location (> 4 hours)', async () => {
    const staleTime = new Date(Date.now() - 5 * 60 * 60 * 1000); // 5 hours ago

    // Update Provider 1 location to be stale
    await db
      .update(providerAvailability)
      .set({ locationUpdatedAt: staleTime })
      .where(eq(providerAvailability.providerId, SEED_PROVIDER_1_ID));

    const matched = await MatchingService.findMatchingProviders(
      { lat: 51.1283, lng: 71.4305 },
      ['AUTO_ELECTRIC'],
      5
    );

    const providerIds = matched.map((p) => p.providerId);
    expect(providerIds).not.toContain(SEED_PROVIDER_1_ID);

    // Restore Provider 1 location timestamp
    await db
      .update(providerAvailability)
      .set({ locationUpdatedAt: new Date() })
      .where(eq(providerAvailability.providerId, SEED_PROVIDER_1_ID));
  });

  // 5. Outside Radius Excluded
  it('5. Excludes provider outside 5km radius (e.g. 25km away)', async () => {
    const matched = await MatchingService.findMatchingProviders(
      { lat: 51.1283, lng: 71.4305 },
      ['AUTO_ELECTRIC'],
      5
    );
    const providerIds = matched.map((p) => p.providerId);
    expect(providerIds).not.toContain(SEED_PROVIDER_FAR_ID);
  });

  // 6. Blocked Provider Excluded
  it('6. Excludes blocked provider from matching', async () => {
    const matched = await MatchingService.findMatchingProviders(
      { lat: 51.1283, lng: 71.4305 },
      ['AUTO_ELECTRIC'],
      10
    );
    const providerIds = matched.map((p) => p.providerId);
    expect(providerIds).not.toContain(SEED_PROVIDER_BLOCKED_ID);
  });

  let offer1Id: string;
  let offer2Id: string;

  // 7. Provider Can Create Valid Offer
  it('7. Eligible provider creates a valid offer in tiyn and updates status to OFFERS_RECEIVED', async () => {
    const offer1 = await OfferService.createOffer(
      {
        requestId: createdRequestId,
        pricingMode: 'diagnostic_fee',
        amountTiyn: 500000, // 5,000 KZT in tiyn
        etaMinutes: 20,
        message: 'Буду через 20 минут со сканером',
      },
      mockProvider1
    );

    expect(offer1.id).toBeDefined();
    expect(offer1.pricingMode).toBe('diagnostic_fee');
    expect(offer1.amountTiyn).toBe(500000);
    expect(offer1.status).toBe('SUBMITTED');
    offer1Id = offer1.id;

    // Check request status updated to OFFERS_RECEIVED
    const request = await RequestService.getRequestById(createdRequestId, mockCustomer);
    expect(request.status).toBe('OFFERS_RECEIVED');

    // Provider 2 also submits an offer
    const offer2 = await OfferService.createOffer(
      {
        requestId: createdRequestId,
        pricingMode: 'fixed',
        amountTiyn: 800000, // 8,000 KZT
        etaMinutes: 15,
        message: 'СТО рядом, готовы выехать',
      },
      mockProvider2
    );
    offer2Id = offer2.id;
  });

  // 8. Duplicate Offer Rejected
  it('8. Rejects duplicate offer from the same provider (409 Conflict)', async () => {
    await expect(
      OfferService.createOffer(
        {
          requestId: createdRequestId,
          pricingMode: 'fixed',
          amountTiyn: 600000,
          etaMinutes: 30,
        },
        mockProvider1
      )
    ).rejects.toThrow(ConflictError);
  });

  // 9. Unauthorized / Ineligible Provider Rejected
  it('9. Rejects offer from provider without matching capabilities (403 Forbidden)', async () => {
    await expect(
      OfferService.createOffer(
        {
          requestId: createdRequestId,
          pricingMode: 'fixed',
          amountTiyn: 700000,
          etaMinutes: 25,
        },
        mockProvider4
      )
    ).rejects.toThrow(ForbiddenError);
  });

  // 10. Rejects Offer Creation on Expired Request
  it('10. Rejects offer creation on expired request (409 Conflict)', async () => {
    const pastDate = new Date(Date.now() - 1000 * 60);
    const [expiredReq] = await db
      .insert(serviceRequests)
      .values({
        customerId: mockCustomer.id,
        category: 'battery_jumpstart',
        requiredCapabilities: ['BATTERY'],
        location: { lat: 51.1283, lng: 71.4305 },
        status: 'PUBLISHED',
        currentRadiusKm: 5,
        publishedAt: new Date(Date.now() - 1000 * 3600),
        expiresAt: pastDate,
        nextExpansionAt: pastDate,
      })
      .returning();

    await expect(
      OfferService.createOffer(
        {
          requestId: expiredReq.id,
          pricingMode: 'fixed',
          amountTiyn: 400000,
          etaMinutes: 15,
        },
        mockProvider1
      )
    ).rejects.toThrow(ConflictError);
  });

  // 10b. Expired Request Selection Rejection
  it('10b. Rejects offer selection on expired request (409 Conflict)', async () => {
    const pastDate = new Date(Date.now() - 1000 * 60);
    const [expiredReq] = await db
      .insert(serviceRequests)
      .values({
        customerId: mockCustomer.id,
        category: 'battery_jumpstart',
        requiredCapabilities: ['BATTERY'],
        location: { lat: 51.1283, lng: 71.4305 },
        status: 'OFFERS_RECEIVED',
        currentRadiusKm: 5,
        publishedAt: new Date(Date.now() - 1000 * 3600),
        expiresAt: pastDate,
        nextExpansionAt: pastDate,
      })
      .returning();

    const [expiredOffer] = await db
      .insert(providerOffers)
      .values({
        requestId: expiredReq.id,
        providerId: SEED_PROVIDER_1_ID,
        pricingMode: 'fixed',
        amountTiyn: 400000,
        etaMinutes: 15,
        status: 'SUBMITTED',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    await expect(
      OrderService.selectOffer(
        { requestId: expiredReq.id, offerId: expiredOffer.id },
        mockCustomer
      )
    ).rejects.toThrow(ConflictError);
  });

  // 11. Atomic Offer Selection
  it('11. Executes 11-step atomic offer selection: creates Order, accepts chosen offer, rejects others', async () => {
    const result = await OrderService.selectOffer(
      {
        requestId: createdRequestId,
        offerId: offer1Id,
      },
      mockCustomer
    );

    expect(result.order).toBeDefined();
    expect(result.order.status).toBe('PROVIDER_SELECTED');
    expect(result.order.agreedPricingMode).toBe('diagnostic_fee');
    expect(result.order.agreedAmountTiyn).toBe(500000);

    // Verify selected offer is ACCEPTED
    const [acceptedOffer] = await db
      .select()
      .from(providerOffers)
      .where(eq(providerOffers.id, offer1Id));
    expect(acceptedOffer.status).toBe('ACCEPTED');

    // Verify other offer is REJECTED
    const [rejectedOffer] = await db
      .select()
      .from(providerOffers)
      .where(eq(providerOffers.id, offer2Id));
    expect(rejectedOffer.status).toBe('REJECTED');

    // Verify request is PROVIDER_SELECTED
    const [updatedReq] = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, createdRequestId));
    expect(updatedReq.status).toBe('PROVIDER_SELECTED');
  });

  // -------------------------------------------------------------
  // REAL CONCURRENCY TESTS (P1)
  // -------------------------------------------------------------
  describe('Real Concurrent Execution & Race Safety', () => {
    it('12. Real Concurrent Selection: exactly one succeeds and exactly one gets 409 Conflict', async () => {
      // 1. Create a fresh request
      const reqResult = await RequestService.createRequest(
        {
          category: 'electrical_starting',
          location: { lat: 51.1283, lng: 71.4305 },
        },
        mockCustomer
      );
      const testReqId = reqResult.request.id;

      // 2. Create 2 submitted offers from Provider 1 and Provider 2
      const offerA = await OfferService.createOffer(
        {
          requestId: testReqId,
          pricingMode: 'fixed',
          amountTiyn: 300000,
          etaMinutes: 10,
        },
        mockProvider1
      );

      const offerB = await OfferService.createOffer(
        {
          requestId: testReqId,
          pricingMode: 'fixed',
          amountTiyn: 350000,
          etaMinutes: 12,
        },
        mockProvider2
      );

      // 3. Execute true concurrent selection via Promise.allSettled
      const results = await Promise.allSettled([
        OrderService.selectOffer({ requestId: testReqId, offerId: offerA.id }, mockCustomer),
        OrderService.selectOffer({ requestId: testReqId, offerId: offerB.id }, mockCustomer),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

      // Verify DB state: exactly 1 order exists for this request
      const existingOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.requestId, testReqId));
      expect(existingOrders.length).toBe(1);

      // Verify request status is PROVIDER_SELECTED
      const [finalReq] = await db
        .select()
        .from(serviceRequests)
        .where(eq(serviceRequests.id, testReqId));
      expect(finalReq.status).toBe('PROVIDER_SELECTED');

      // Verify exactly one offer is ACCEPTED and the other REJECTED
      const [offerARow] = await db.select().from(providerOffers).where(eq(providerOffers.id, offerA.id));
      const [offerBRow] = await db.select().from(providerOffers).where(eq(providerOffers.id, offerB.id));

      const statuses = [offerARow.status, offerBRow.status].sort();
      expect(statuses).toEqual(['ACCEPTED', 'REJECTED']);
    });

    it('13. Real Concurrent Offer Creation: same provider creating 2 offers concurrently -> exactly 1 succeeds', async () => {
      // 1. Create a fresh request
      const reqResult = await RequestService.createRequest(
        {
          category: 'battery_jumpstart',
          location: { lat: 51.1283, lng: 71.4305 },
        },
        mockCustomer
      );
      const testReqId = reqResult.request.id;

      // 2. Execute concurrent offer submission for the same provider
      const results = await Promise.allSettled([
        OfferService.createOffer(
          {
            requestId: testReqId,
            pricingMode: 'fixed',
            amountTiyn: 500000,
            etaMinutes: 20,
          },
          mockProvider1
        ),
        OfferService.createOffer(
          {
            requestId: testReqId,
            pricingMode: 'fixed',
            amountTiyn: 550000,
            etaMinutes: 25,
          },
          mockProvider1
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);

      // Verify exactly 1 offer in database
      const offersInDb = await db
        .select()
        .from(providerOffers)
        .where(eq(providerOffers.requestId, testReqId));
      expect(offersInDb.length).toBe(1);
    });

    it('14. Offer Creation vs Selection Race: cannot insert offer on already-selected request', async () => {
      // 1. Create a fresh request
      const reqResult = await RequestService.createRequest(
        {
          category: 'battery_jumpstart',
          location: { lat: 51.1283, lng: 71.4305 },
        },
        mockCustomer
      );
      const testReqId = reqResult.request.id;

      // 2. Provider 1 submits offer
      const offer1 = await OfferService.createOffer(
        {
          requestId: testReqId,
          pricingMode: 'fixed',
          amountTiyn: 500000,
          etaMinutes: 20,
        },
        mockProvider1
      );

      // 3. Customer selects Provider 1 offer -> request becomes PROVIDER_SELECTED
      await OrderService.selectOffer({ requestId: testReqId, offerId: offer1.id }, mockCustomer);

      // 4. Provider 2 attempts to submit an offer after selection
      await expect(
        OfferService.createOffer(
          {
            requestId: testReqId,
            pricingMode: 'fixed',
            amountTiyn: 600000,
            etaMinutes: 15,
          },
          mockProvider2
        )
      ).rejects.toThrow(ConflictError);

      // Verify no SUBMITTED offers exist on the selected request
      const submittedOffers = await db
        .select()
        .from(providerOffers)
        .where(eq(providerOffers.requestId, testReqId));
      expect(submittedOffers.every((o) => o.status !== 'SUBMITTED')).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // DIRECT DATABASE CHECK CONSTRAINT TESTS (P1)
  // -------------------------------------------------------------
  describe('Direct PostgreSQL Check Constraints Validation', () => {
    it('DB rejects invalid ETA (< 1 or > 480) via chk_provider_offers_eta', async () => {
      await expect(
        db.insert(providerOffers).values({
          requestId: createdRequestId,
          providerId: SEED_PROVIDER_3_ID,
          pricingMode: 'fixed',
          amountTiyn: 500000,
          etaMinutes: 0, // Violates eta >= 1
        })
      ).rejects.toThrow();

      await expect(
        db.insert(providerOffers).values({
          requestId: createdRequestId,
          providerId: SEED_PROVIDER_3_ID,
          pricingMode: 'fixed',
          amountTiyn: 500000,
          etaMinutes: 500, // Violates eta <= 480
        })
      ).rejects.toThrow();
    });

    it('DB rejects invalid pricing mode combinations via chk_provider_offers_pricing', async () => {
      // Fixed pricing without amountTiyn
      await expect(
        db.insert(providerOffers).values({
          requestId: createdRequestId,
          providerId: SEED_PROVIDER_3_ID,
          pricingMode: 'fixed',
          amountTiyn: null,
          etaMinutes: 20,
        })
      ).rejects.toThrow();

      // Estimate range with min > max
      await expect(
        db.insert(providerOffers).values({
          requestId: createdRequestId,
          providerId: SEED_PROVIDER_3_ID,
          pricingMode: 'estimate_range',
          minAmountTiyn: 200000,
          maxAmountTiyn: 100000, // max < min
          etaMinutes: 20,
        })
      ).rejects.toThrow();
    });

    it('DB rejects invalid provider rating (< 0 or > 500) via chk_providers_rating', async () => {
      await expect(
        db.insert(providers).values({
          userId: SEED_CUSTOMER_ID,
          businessName: 'Invalid Rating Provider',
          providerType: 'STO',
          rating: 600, // > 500
        })
      ).rejects.toThrow();

      await expect(
        db.insert(providers).values({
          userId: SEED_CUSTOMER_ID,
          businessName: 'Negative Rating Provider',
          providerType: 'STO',
          rating: -10, // < 0
        })
      ).rejects.toThrow();
    });

    it('DB rejects negative completed_jobs via chk_providers_completed_jobs', async () => {
      await expect(
        db.insert(providers).values({
          userId: SEED_CUSTOMER_ID,
          businessName: 'Negative Jobs Provider',
          providerType: 'STO',
          completedJobs: -5,
        })
      ).rejects.toThrow();
    });

    it('DB rejects invalid provider availability radius via chk_provider_availability_radius', async () => {
      await expect(
        db.insert(providerAvailability).values({
          providerId: SEED_PROVIDER_3_ID,
          isOnline: true,
          location: { lat: 51.1283, lng: 71.4305 },
          radiusKm: 0, // < 1
          autoOfflineAt: new Date(Date.now() + 3600000),
        })
      ).rejects.toThrow();

      await expect(
        db.insert(providerAvailability).values({
          providerId: SEED_PROVIDER_3_ID,
          isOnline: true,
          location: { lat: 51.1283, lng: 71.4305 },
          radiusKm: 200, // > 100
          autoOfflineAt: new Date(Date.now() + 3600000),
        })
      ).rejects.toThrow();
    });

    it('DB rejects invalid service request radius via chk_service_requests_radius', async () => {
      await expect(
        db.insert(serviceRequests).values({
          customerId: SEED_CUSTOMER_ID,
          category: 'battery_jumpstart',
          requiredCapabilities: ['BATTERY'],
          location: { lat: 51.1283, lng: 71.4305 },
          currentRadiusKm: 0, // < 1
          expiresAt: new Date(Date.now() + 3600000),
          nextExpansionAt: new Date(Date.now() + 180000),
        })
      ).rejects.toThrow();
    });

    it('DB rejects invalid vehicle year (< 1950 or > 2100) via chk_vehicles_year', async () => {
      await expect(
        db.insert(vehicles).values({
          userId: SEED_CUSTOMER_ID,
          make: 'Ford',
          model: 'Model T',
          year: 1908, // < 1950
        })
      ).rejects.toThrow();

      await expect(
        db.insert(vehicles).values({
          userId: SEED_CUSTOMER_ID,
          make: 'Tesla',
          model: 'Cybercraft',
          year: 2150, // > 2100
        })
      ).rejects.toThrow();
    });

    it('DB enforces UNIQUE(request_id) on orders table via uq_orders_request', async () => {
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.requestId, createdRequestId));
      expect(order).toBeDefined();

      // Attempting to insert another order for the same request_id directly into DB
      await expect(
        db.insert(orders).values({
          requestId: createdRequestId, // Duplicate request_id
          offerId: order.offerId,
          customerId: order.customerId,
          providerId: order.providerId,
          status: 'PROVIDER_SELECTED',
          agreedPricingMode: 'fixed',
          agreedAmountTiyn: 500000,
        })
      ).rejects.toThrow();
    });

    it('parseGeographyPoint / geographyPoint throws on corrupted or unrecognizable format (D-1)', () => {
      expect(() => parseGeographyPoint('CORRUPTED_NOT_A_POINT')).toThrow(
        /Invalid WKB\/geography point format/
      );
      expect(() => parseGeographyPoint('')).toThrow(
        /Invalid WKB\/geography point format/
      );
    });

    it('DB enforces UNIQUE(user_id) on providers table via providers_user_id_unique (D-4)', async () => {
      // SEED_PROVIDER_1_ID already exists with user_id 'a1000000-0000-0000-0000-000000000001'
      await expect(
        db.insert(providers).values({
          userId: 'a1000000-0000-0000-0000-000000000001',
          businessName: 'Duplicate User Provider',
          providerType: 'STO',
        })
      ).rejects.toThrow();
    });

    it('DB enforces UNIQUE(provider_id, capability) on provider_capabilities (D-2)', async () => {
      // Seed provider 1 already has BATTERY capability
      await expect(
        db.insert(providerCapabilities).values({
          providerId: SEED_PROVIDER_1_ID,
          capability: 'BATTERY',
        })
      ).rejects.toThrow();
    });

    it('DB enforces UNIQUE(provider_id, service_mode) on provider_service_modes (D-3)', async () => {
      // Seed provider 1 already has MOBILE service mode
      await expect(
        db.insert(providerServiceModes).values({
          providerId: SEED_PROVIDER_1_ID,
          serviceMode: 'MOBILE',
        })
      ).rejects.toThrow();
    });

    it('DB enforces CHECK(rating >= 1 AND rating <= 5) on reviews table (D-5)', async () => {
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.requestId, createdRequestId));

      // Rating 0 is invalid (< 1)
      await expect(
        db.insert(reviews).values({
          orderId: order.id,
          fromUserId: order.customerId,
          toUserId: order.providerId,
          rating: 0,
        })
      ).rejects.toThrow();

      // Rating 6 is invalid (> 5)
      await expect(
        db.insert(reviews).values({
          orderId: order.id,
          fromUserId: order.customerId,
          toUserId: order.providerId,
          rating: 6,
        })
      ).rejects.toThrow();
    });
  });
});

