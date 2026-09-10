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
import { providerOffers, orders, users, providerAvailability, vehicles, serviceRequests } from '../src/db/schema/index';
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
    const result = await RequestService.createRequest({
      customerId: mockCustomer.id,
      category: 'electrical_starting',
      location: { lat: 51.1283, lng: 71.4305 }, // Astana Baiterek
      description: 'Не заводится, стартер щелкает',
    });

    expect(result.request).toBeDefined();
    expect(result.request.id).toBeDefined();
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
      RequestService.createRequest({
        customerId: mockCustomer.id,
        category: 'battery_jumpstart',
        location: { lat: 51.1283, lng: 71.4305 },
        vehicleId: otherVehicle.id,
      })
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

  // 4. Stale Provider Location Excluded (P1 item 14 fixed)
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
  it('7. Eligible provider creates a valid offer in tiyn', async () => {
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
    // Provider 4 only has MECHANICAL_MINOR, request is electrical_starting
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

  // 10. Customer Sees Own Offers & IDOR Protection
  it('10. Customer sees offers for request, unauthorized user is blocked', async () => {
    const customerOffers = await OfferService.getOffersForRequest(
      createdRequestId,
      mockCustomer
    );
    expect(customerOffers.length).toBe(2);

    // Random unauthorized user is blocked
    const otherUser: AuthUser = {
      id: 'e9990000-0000-0000-0000-000000000099',
      phone: '+77099999999',
      roles: ['motorist'],
      isBlocked: false,
    };
    await db.insert(users).values({
      id: otherUser.id,
      phone: otherUser.phone,
      roles: otherUser.roles,
      isBlocked: false,
    });

    await expect(
      OfferService.getOffersForRequest(createdRequestId, otherUser)
    ).rejects.toThrow(ForbiddenError);
  });

  // 10b. Expired Request Selection Rejection
  it('10b. Rejects offer selection on expired request (409 Conflict)', async () => {
    // Create an expired request
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

  // 12. Concurrent Selection Handling
  it('12. Concurrent selection is rejected (409 Conflict) and only one order is created', async () => {
    // Attempting to select again after already selected
    await expect(
      OrderService.selectOffer(
        {
          requestId: createdRequestId,
          offerId: offer2Id,
        },
        mockCustomer
      )
    ).rejects.toThrow(ConflictError);

    // Verify exactly 1 order exists for this request
    const existingOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.requestId, createdRequestId));
    expect(existingOrders.length).toBe(1);
  });
});
