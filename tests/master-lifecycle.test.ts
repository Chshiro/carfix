import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '../src/db/client';
import {
  users,
  providers,
  providerAvailability,
  serviceRequests,
  providerOffers,
  orders,
  reviews,
} from '../src/db/schema/index';
import { POST as masterStatusHandler } from '../src/app/api/master/status/route';
import { PATCH as masterLocationHandler } from '../src/app/api/master/location/route';
import { GET as masterActiveHandler } from '../src/app/api/master/active/route';
import { GET as masterRequestsHandler } from '../src/app/api/master/requests/route';
import { GET as masterStatsHandler } from '../src/app/api/master/stats/route';
import { createAuthToken } from '../src/server/auth';
import { seedDatabase } from '../src/db/seed';

describe('Slice 6: Master / Provider MVP Journey & Spatial Dispatch', () => {
  const master1UserId = 'a1000000-0000-0000-0000-000000000001';
  const master1ProviderId = 'b1000000-0000-0000-0000-000000000001';
  let masterToken: string;

  beforeEach(async () => {
    await seedDatabase();
    masterToken = await createAuthToken({
      sub: master1UserId,
      phone: '+77021112233',
      roles: ['provider'],
    });
  });

  describe('1. Master Shift & Status Management (POST /api/master/status)', () => {
    it('allows master to toggle online status and set custom location & radius', async () => {
      const req = new NextRequest('http://localhost:3000/api/master/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({
          isOnline: true,
          location: { lat: 51.135, lng: 71.428 },
          radiusKm: 15,
        }),
      });

      const res = await masterStatusHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.data.isOnline).toBe(true);
      expect(json.data.radiusKm).toBe(15);
      expect(json.data.location.lat).toBeCloseTo(51.135);
    });

    it('allows master to go offline (take a break)', async () => {
      const req = new NextRequest('http://localhost:3000/api/master/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({ isOnline: false }),
      });

      const res = await masterStatusHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.isOnline).toBe(false);
    });

    it('rejects non-provider users from toggling master shift status', async () => {
      const customerToken = await createAuthToken({
        sub: 'c0000000-0000-0000-0000-000000000001',
        phone: '+77011112233',
        roles: ['motorist'],
      });

      const req = new NextRequest('http://localhost:3000/api/master/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({ isOnline: true }),
      });

      const res = await masterStatusHandler(req);
      expect(res.status).toBe(403);
    });
  });

  describe('2. Master GPS Coordinates Live Update (PATCH /api/master/location)', () => {
    it('updates master current GPS location in PostGIS point', async () => {
      const newCoords = { lat: 51.121, lng: 71.439 };
      const req = new NextRequest('http://localhost:3000/api/master/location', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${masterToken}`,
        },
        body: JSON.stringify({ location: newCoords }),
      });

      const res = await masterLocationHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.location.lat).toBeCloseTo(newCoords.lat);
      expect(json.data.location.lng).toBeCloseTo(newCoords.lng);
    });
  });

  describe('3. Master Active State Hydration (GET /api/master/active)', () => {
    it('hydrates master profile, availability, and active order when in progress', async () => {
      const customerId = 'c0000000-0000-0000-0000-000000000001';

      // Insert active request
      const [reqRecord] = await db
        .insert(serviceRequests)
        .values({
          customerId,
          category: 'electrical_starting',
          requiredCapabilities: ['AUTO_ELECTRIC'],
          location: { lat: 51.128, lng: 71.43 },
          status: 'PROVIDER_SELECTED',
          expiresAt: new Date(Date.now() + 20 * 60 * 1000),
          nextExpansionAt: new Date(Date.now() + 3 * 60 * 1000),
        })
        .returning();

      // Insert offer from Master 1
      const [offerRecord] = await db
        .insert(providerOffers)
        .values({
          requestId: reqRecord.id,
          providerId: master1ProviderId,
          pricingMode: 'fixed',
          amountTiyn: 800000,
          etaMinutes: 12,
          status: 'ACCEPTED',
        })
        .returning();

      // Insert order in progress
      const [orderRecord] = await db
        .insert(orders)
        .values({
          requestId: reqRecord.id,
          offerId: offerRecord.id,
          customerId,
          providerId: master1ProviderId,
          status: 'EN_ROUTE',
          agreedPricingMode: 'fixed',
          agreedAmountTiyn: 800000,
        })
        .returning();

      const req = new NextRequest('http://localhost:3000/api/master/active', {
        headers: { Authorization: `Bearer ${masterToken}` },
      });

      const res = await masterActiveHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.provider.businessName).toBe('Мастер Азамат (Автоэлектрик / АКБ)');
      expect(json.data.activeOrder).toBeDefined();
      expect(json.data.activeOrder.id).toBe(orderRecord.id);
      expect(json.data.activeOrder.status).toBe('EN_ROUTE');
      expect(json.data.activeOrder.customer.phone).toBe('+77011112233');
    });
  });

  describe('4. Master Nearby Requests Live Feed (GET /api/master/requests)', () => {
    it('returns open published requests matching provider capabilities within radius sorted by distance', async () => {
      const customerId = 'c0000000-0000-0000-0000-000000000001';

      // 1. Close request (1 km from master at 51.135, 71.428)
      const [closeReq] = await db
        .insert(serviceRequests)
        .values({
          customerId,
          category: 'battery_jumpstart',
          requiredCapabilities: ['BATTERY'],
          description: 'Сел аккумулятор возле Дома Министерств',
          location: { lat: 51.13, lng: 71.43 },
          status: 'PUBLISHED',
          currentRadiusKm: 5,
          expiresAt: new Date(Date.now() + 25 * 60 * 1000),
          nextExpansionAt: new Date(Date.now() + 3 * 60 * 1000),
        })
        .returning();

      // 2. Far request outside Astana / outside radius
      await db.insert(serviceRequests).values({
        customerId,
        category: 'battery_jumpstart',
        requiredCapabilities: ['BATTERY'],
        description: 'Слишком далеко за городом',
        location: { lat: 51.9, lng: 72.5 },
        status: 'PUBLISHED',
        currentRadiusKm: 5,
        expiresAt: new Date(Date.now() + 25 * 60 * 1000),
        nextExpansionAt: new Date(Date.now() + 3 * 60 * 1000),
      });

      const req = new NextRequest('http://localhost:3000/api/master/requests', {
        headers: { Authorization: `Bearer ${masterToken}` },
      });

      const res = await masterRequestsHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.length).toBeGreaterThanOrEqual(1);
      const matched = json.data.find((r: { id: string }) => r.id === closeReq.id);
      expect(matched).toBeDefined();
      expect(matched.distanceKm).toBeLessThan(5);
    });
  });

  describe('5. Master Shift Stats & Revenue (GET /api/master/stats)', () => {
    it('computes completed orders, earned GMV in ₸, and mutual review records', async () => {
      const customerId = 'c0000000-0000-0000-0000-000000000001';

      const [reqRecord] = await db
        .insert(serviceRequests)
        .values({
          customerId,
          category: 'electrical_starting',
          requiredCapabilities: ['AUTO_ELECTRIC'],
          location: { lat: 51.128, lng: 71.43 },
          status: 'COMPLETED',
          expiresAt: new Date(Date.now() + 20 * 60 * 1000),
          nextExpansionAt: new Date(Date.now() + 3 * 60 * 1000),
        })
        .returning();

      const [offerRecord] = await db
        .insert(providerOffers)
        .values({
          requestId: reqRecord.id,
          providerId: master1ProviderId,
          pricingMode: 'fixed',
          amountTiyn: 1200000,
          etaMinutes: 10,
          status: 'ACCEPTED',
        })
        .returning();

      const [orderRecord] = await db
        .insert(orders)
        .values({
          requestId: reqRecord.id,
          offerId: offerRecord.id,
          customerId,
          providerId: master1ProviderId,
          status: 'COMPLETED',
          agreedPricingMode: 'fixed',
          agreedAmountTiyn: 1200000,
          finalAmountTiyn: 1200000,
        })
        .returning();

      // Client left review for master
      await db.insert(reviews).values({
        orderId: orderRecord.id,
        fromUserId: customerId,
        toUserId: master1UserId,
        rating: 5,
        comment: 'Мастер настоящий профи, быстро нашел причину короткого замыкания!',
      });

      const req = new NextRequest('http://localhost:3000/api/master/stats', {
        headers: { Authorization: `Bearer ${masterToken}` },
      });

      const res = await masterStatsHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.totalGmvTiyn).toBeGreaterThanOrEqual(1200000);
      expect(json.data.todayGmvTiyn).toBeGreaterThanOrEqual(1200000);
      expect(json.data.orders[0].finalAmountTiyn).toBe(1200000);
      expect(json.data.orders[0].receivedReview.rating).toBe(5);
    });
  });
});
