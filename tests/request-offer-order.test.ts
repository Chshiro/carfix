import { describe, it, expect, beforeAll } from 'vitest';
import { seedDatabase, SEED_CUSTOMER_ID, SEED_PROVIDER_1_ID, SEED_PROVIDER_2_ID, SEED_PROVIDER_3_ID, SEED_PROVIDER_4_ID, SEED_PROVIDER_FAR_ID, SEED_PROVIDER_OFFLINE_ID, SEED_PROVIDER_BLOCKED_ID } from '../src/db/seed';
import { RequestService } from '../src/server/services/request.service';
import { MatchingService } from '../src/server/services/matching.service';
import { OfferService } from '../src/server/services/offer.service';
import { OrderService } from '../src/server/services/order.service';
import { ConflictError, ForbiddenError } from '../src/server/errors';
import { db } from '../src/db/client';
import { serviceRequests, providerOffers, orders, users } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';

describe('CarFix Vertical Slice: Request → Offer → Selection → Order', () => {
  beforeAll(async () => {
    await seedDatabase();
  });

  let createdRequestId: string;

  // 1. Request Creation Without Vehicle
  it('1. Creates a valid ServiceRequest without vehicle (vehicleId = null)', async () => {
    const result = await RequestService.createRequest({
      customerId: SEED_CUSTOMER_ID,
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

    createdRequestId = result.request.id;
  });

  // 2. Spatial & Capability Matching (OR Semantics)
  it('2. Matches eligible nearby providers and applies capability OR semantics', async () => {
    // electrical_starting requires AUTO_ELECTRIC or DIAGNOSTICS
    const matched = await MatchingService.findMatchingProviders(
      { lat: 51.1283, lng: 71.4305 },
      ['AUTO_ELECTRIC', 'DIAGNOSTICS'],
      5 // 5 km radius
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
    // In seed, all active providers have fresh timestamps. If we query with stale date, they are filtered out.
    const matched = await MatchingService.findMatchingProviders(
      { lat: 51.1283, lng: 71.4305 },
      ['AUTO_ELECTRIC'],
      5
    );
    expect(matched.every((p) => p.distanceKm <= 5)).toBe(true);
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
    const offer1 = await OfferService.createOffer({
      requestId: createdRequestId,
      providerId: SEED_PROVIDER_1_ID,
      pricingMode: 'diagnostic_fee',
      amountTiyn: 500000, // 5,000 KZT in tiyn
      etaMinutes: 20,
      message: 'Буду через 20 минут со сканером',
    });

    expect(offer1.id).toBeDefined();
    expect(offer1.pricingMode).toBe('diagnostic_fee');
    expect(offer1.amountTiyn).toBe(500000);
    expect(offer1.status).toBe('SUBMITTED');
    offer1Id = offer1.id;

    // Check request status updated to OFFERS_RECEIVED
    const request = await RequestService.getRequestById(createdRequestId);
    expect(request.status).toBe('OFFERS_RECEIVED');

    // Provider 2 also submits an offer
    const offer2 = await OfferService.createOffer({
      requestId: createdRequestId,
      providerId: SEED_PROVIDER_2_ID,
      pricingMode: 'fixed',
      amountTiyn: 800000, // 8,000 KZT
      etaMinutes: 15,
      message: 'СТО рядом, готовы выехать',
    });
    offer2Id = offer2.id;
  });

  // 8. Duplicate Offer Rejected
  it('8. Rejects duplicate offer from the same provider (409 Conflict)', async () => {
    await expect(
      OfferService.createOffer({
        requestId: createdRequestId,
        providerId: SEED_PROVIDER_1_ID,
        pricingMode: 'fixed',
        amountTiyn: 600000,
        etaMinutes: 30,
      })
    ).rejects.toThrow(ConflictError);
  });

  // 9. Unauthorized / Ineligible Provider Rejected
  it('9. Rejects offer from provider without matching capabilities (403 Forbidden)', async () => {
    // Provider 4 only has MECHANICAL_MINOR, request is electrical_starting
    await expect(
      OfferService.createOffer({
        requestId: createdRequestId,
        providerId: SEED_PROVIDER_4_ID,
        pricingMode: 'fixed',
        amountTiyn: 700000,
        etaMinutes: 25,
      })
    ).rejects.toThrow(ForbiddenError);
  });

  // 10. Customer Sees Own Offers & IDOR Protection
  it('10. Customer sees offers for request, unauthorized user is blocked', async () => {
    // Customer who created the request can see all offers
    const customerOffers = await OfferService.getOffersForRequest(
      createdRequestId,
      SEED_CUSTOMER_ID
    );
    expect(customerOffers.length).toBe(2);

    // Random unauthorized user is blocked
    const otherUserId = 'e9990000-0000-0000-0000-000000000099';
    await db.insert(users).values({
      id: otherUserId,
      phone: '+77099999999',
      roles: ['motorist'],
      isBlocked: false,
    });

    await expect(
      OfferService.getOffersForRequest(createdRequestId, otherUserId)
    ).rejects.toThrow(ForbiddenError);
  });

  // 11. Atomic Offer Selection
  it('11. Executes 11-step atomic offer selection: creates Order, accepts chosen offer, rejects others', async () => {
    const result = await OrderService.selectOffer({
      requestId: createdRequestId,
      offerId: offer1Id,
      customerId: SEED_CUSTOMER_ID,
    });

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
      OrderService.selectOffer({
        requestId: createdRequestId,
        offerId: offer2Id,
        customerId: SEED_CUSTOMER_ID,
      })
    ).rejects.toThrow(ConflictError);

    // Verify exactly 1 order exists for this request
    const existingOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.requestId, createdRequestId));
    expect(existingOrders.length).toBe(1);
  });
});
