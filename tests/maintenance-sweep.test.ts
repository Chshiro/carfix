import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  seedDatabase,
  SEED_CUSTOMER_ID,
  SEED_PROVIDER_1_ID,
  SEED_PROVIDER_2_ID,
  SEED_PROVIDER_3_ID,
} from '../src/db/seed';
import { RequestService } from '../src/server/services/request.service';
import { OfferService } from '../src/server/services/offer.service';
import { MaintenanceService } from '../src/server/services/maintenance.service';
import { AuthUser, createAuthToken } from '../src/server/auth';
import { db } from '../src/db/client';
import {
  users,
  serviceRequests,
  providerOffers,
  providerAvailability,
} from '../src/db/schema/index';
import { eq } from 'drizzle-orm';
import { POST as sweepRoute } from '../src/app/api/maintenance/sweep/route';

describe('Slice 3: Dynamic Radius Expansion, Expiration & Auto-Offline Maintenance Sweep', () => {
  const customerUserId = SEED_CUSTOMER_ID;
  const adminUserId = 'e0000000-0000-0000-0000-000000000001';

  const mockCustomer: AuthUser = {
    id: customerUserId,
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

  let customerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await seedDatabase();

    // Create admin user in DB
    await db.insert(users).values({
      id: adminUserId,
      phone: '+77000000000',
      roles: ['admin'],
      isBlocked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();

    customerToken = await createAuthToken({
      sub: customerUserId,
      phone: '+77011112233',
      roles: ['motorist'],
    });

    adminToken = await createAuthToken({
      sub: adminUserId,
      phone: '+77000000000',
      roles: ['admin'],
    });
  });

  beforeEach(async () => {
    await seedDatabase();
    await db.insert(users).values({
      id: adminUserId,
      phone: '+77000000000',
      roles: ['admin'],
      isBlocked: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  });

  describe('1. Dynamic Radius Expansion', () => {
    it('should expand active request radius from 5 km -> 10 km when nextExpansionAt is reached', async () => {
      const now = new Date();
      const pastExpansion = new Date(now.getTime() - 10000); // 10s ago
      const futureExpiry = new Date(now.getTime() + 15 * 60 * 1000); // 15m in future

      const reqRes = await RequestService.createRequest(
        {
          category: 'battery_jumpstart',
          location: { lat: 51.128, lng: 71.4305 },
          description: 'Car battery dead at Baiterek',
        },
        mockCustomer
      );
      const reqId = reqRes.request.id;

      // Artificially set nextExpansionAt to the past
      await db
        .update(serviceRequests)
        .set({
          currentRadiusKm: 5,
          nextExpansionAt: pastExpansion,
          expiresAt: futureExpiry,
        })
        .where(eq(serviceRequests.id, reqId));

      const count = await MaintenanceService.expandRequestRadii(now);
      expect(count).toBe(1);

      const [updated] = await db
        .select()
        .from(serviceRequests)
        .where(eq(serviceRequests.id, reqId));

      expect(updated.currentRadiusKm).toBe(10);
      expect(new Date(updated.nextExpansionAt).getTime()).toBeGreaterThan(now.getTime());
    });

    it('should expand stepwise 10 km -> 15 km -> 25 km (capped)', async () => {
      const now = new Date();
      const pastExpansion = new Date(now.getTime() - 10000);
      const futureExpiry = new Date(now.getTime() + 15 * 60 * 1000);

      const reqRes = await RequestService.createRequest(
        {
          category: 'battery_jumpstart',
          location: { lat: 51.128, lng: 71.4305 },
          description: 'Need battery jump',
        },
        mockCustomer
      );
      const reqId = reqRes.request.id;

      // Start at 10 km
      await db
        .update(serviceRequests)
        .set({
          currentRadiusKm: 10,
          nextExpansionAt: pastExpansion,
          expiresAt: futureExpiry,
        })
        .where(eq(serviceRequests.id, reqId));

      // Expand to 15 km
      let count = await MaintenanceService.expandRequestRadii(now);
      expect(count).toBe(1);

      let [updated] = await db
        .select()
        .from(serviceRequests)
        .where(eq(serviceRequests.id, reqId));
      expect(updated.currentRadiusKm).toBe(15);

      // Set past expansion again and expand to 25 km
      await db
        .update(serviceRequests)
        .set({ nextExpansionAt: pastExpansion })
        .where(eq(serviceRequests.id, reqId));

      count = await MaintenanceService.expandRequestRadii(now);
      expect(count).toBe(1);

      [updated] = await db
        .select()
        .from(serviceRequests)
        .where(eq(serviceRequests.id, reqId));
      expect(updated.currentRadiusKm).toBe(25);

      // Attempt to expand beyond 25 km (capped)
      await db
        .update(serviceRequests)
        .set({ nextExpansionAt: pastExpansion })
        .where(eq(serviceRequests.id, reqId));

      count = await MaintenanceService.expandRequestRadii(now);
      expect(count).toBe(0); // Capped at 25km

      [updated] = await db
        .select()
        .from(serviceRequests)
        .where(eq(serviceRequests.id, reqId));
      expect(updated.currentRadiusKm).toBe(25);
    });

    it('should not expand non-active requests (e.g. COMPLETED / CANCELLED)', async () => {
      const now = new Date();
      const pastExpansion = new Date(now.getTime() - 10000);
      const futureExpiry = new Date(now.getTime() + 15 * 60 * 1000);

      const reqRes = await RequestService.createRequest(
        {
          category: 'battery_jumpstart',
          location: { lat: 51.128, lng: 71.4305 },
          description: 'Cancelled request test',
        },
        mockCustomer
      );
      const reqId = reqRes.request.id;

      await db
        .update(serviceRequests)
        .set({
          status: 'CANCELLED',
          currentRadiusKm: 5,
          nextExpansionAt: pastExpansion,
          expiresAt: futureExpiry,
        })
        .where(eq(serviceRequests.id, reqId));

      const count = await MaintenanceService.expandRequestRadii(now);
      expect(count).toBe(0);

      const [updated] = await db
        .select()
        .from(serviceRequests)
        .where(eq(serviceRequests.id, reqId));
      expect(updated.currentRadiusKm).toBe(5);
    });
  });

  describe('2. Request Expiration & Lingering Offer Rejection', () => {
    it('should expire unfulfilled request and reject SUBMITTED offers when expiresAt <= NOW()', async () => {
      const now = new Date();
      const pastExpiry = new Date(now.getTime() - 60000); // 1m ago

      const reqRes = await RequestService.createRequest(
        {
          category: 'battery_jumpstart',
          location: { lat: 51.128, lng: 71.4305 },
          description: 'Expiring request test',
        },
        mockCustomer
      );
      const reqId = reqRes.request.id;

      // Create an offer from Provider 1
      const offer = await OfferService.createOffer(
        {
          requestId: reqId,
          pricingMode: 'fixed',
          amountTiyn: 500000,
          etaMinutes: 20,
          message: 'On my way',
        },
        mockProvider1
      );

      expect(offer.status).toBe('SUBMITTED');

      // Set expiresAt to past
      await db
        .update(serviceRequests)
        .set({ expiresAt: pastExpiry })
        .where(eq(serviceRequests.id, reqId));

      const expiredCount = await MaintenanceService.expireStaleRequests(now);
      expect(expiredCount).toBe(1);

      // Verify request is EXPIRED
      const [updatedReq] = await db
        .select()
        .from(serviceRequests)
        .where(eq(serviceRequests.id, reqId));
      expect(updatedReq.status).toBe('EXPIRED');

      // Verify offer is REJECTED
      const [updatedOffer] = await db
        .select()
        .from(providerOffers)
        .where(eq(providerOffers.id, offer.id));
      expect(updatedOffer.status).toBe('REJECTED');
    });

    it('should not expire requests whose expiresAt is still in the future', async () => {
      const now = new Date();
      const futureExpiry = new Date(now.getTime() + 10 * 60 * 1000);

      const reqRes = await RequestService.createRequest(
        {
          category: 'battery_jumpstart',
          location: { lat: 51.128, lng: 71.4305 },
          description: 'Active request test',
        },
        mockCustomer
      );
      const reqId = reqRes.request.id;

      await db
        .update(serviceRequests)
        .set({ expiresAt: futureExpiry })
        .where(eq(serviceRequests.id, reqId));

      const expiredCount = await MaintenanceService.expireStaleRequests(now);
      expect(expiredCount).toBe(0);

      const [updatedReq] = await db
        .select()
        .from(serviceRequests)
        .where(eq(serviceRequests.id, reqId));
      expect(updatedReq.status).toBe('PUBLISHED');
    });
  });

  describe('3. Provider Auto-Offline', () => {
    it('should switch online providers to offline when autoOfflineAt <= NOW()', async () => {
      const now = new Date();
      const pastAutoOffline = new Date(now.getTime() - 10000); // 10s ago

      // Ensure Provider 1 is online with past autoOfflineAt
      await db
        .update(providerAvailability)
        .set({
          isOnline: true,
          autoOfflineAt: pastAutoOffline,
        })
        .where(eq(providerAvailability.providerId, SEED_PROVIDER_1_ID));

      // Ensure Provider 2 is online with future autoOfflineAt
      await db
        .update(providerAvailability)
        .set({
          isOnline: true,
          autoOfflineAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
        })
        .where(eq(providerAvailability.providerId, SEED_PROVIDER_2_ID));

      const count = await MaintenanceService.autoOfflineStaleProviders(now);
      expect(count).toBeGreaterThanOrEqual(1);

      // Provider 1 should now be offline
      const [prov1] = await db
        .select()
        .from(providerAvailability)
        .where(eq(providerAvailability.providerId, SEED_PROVIDER_1_ID));
      expect(prov1.isOnline).toBe(false);

      // Provider 2 should remain online
      const [prov2] = await db
        .select()
        .from(providerAvailability)
        .where(eq(providerAvailability.providerId, SEED_PROVIDER_2_ID));
      expect(prov2.isOnline).toBe(true);
    });
  });

  describe('4. Consolidated Maintenance Sweep Service', () => {
    it('should execute expansion, expiration, and auto-offline in a single runSweep call', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 10000);
      const futureDate = new Date(now.getTime() + 15 * 60 * 1000);

      // 1 Request to expand
      const reqExpand = await RequestService.createRequest(
        {
          category: 'battery_jumpstart',
          location: { lat: 51.128, lng: 71.4305 },
          description: 'Expand me',
        },
        mockCustomer
      );
      await db
        .update(serviceRequests)
        .set({
          currentRadiusKm: 5,
          nextExpansionAt: pastDate,
          expiresAt: futureDate,
        })
        .where(eq(serviceRequests.id, reqExpand.request.id));

      // 1 Request to expire
      const reqExpire = await RequestService.createRequest(
        {
          category: 'battery_jumpstart',
          location: { lat: 51.128, lng: 71.4305 },
          description: 'Expire me',
        },
        mockCustomer
      );
      await db
        .update(serviceRequests)
        .set({ expiresAt: pastDate })
        .where(eq(serviceRequests.id, reqExpire.request.id));

      // 1 Provider to auto-offline
      await db
        .update(providerAvailability)
        .set({
          isOnline: true,
          autoOfflineAt: pastDate,
        })
        .where(eq(providerAvailability.providerId, SEED_PROVIDER_3_ID));

      const result = await MaintenanceService.runSweep(now);

      expect(result.expandedRequestsCount).toBeGreaterThanOrEqual(1);
      expect(result.expiredRequestsCount).toBeGreaterThanOrEqual(1);
      expect(result.autoOfflinedProvidersCount).toBeGreaterThanOrEqual(1);
      expect(result.timestamp).toBe(now.toISOString());
    });
  });

  describe('5. Maintenance Sweep HTTP API (POST /api/maintenance/sweep)', () => {
    it('should reject unauthenticated calls with 401', async () => {
      const req = new NextRequest('http://localhost/api/maintenance/sweep', {
        method: 'POST',
      });

      const res = await sweepRoute(req);
      expect(res.status).toBe(401);
    });

    it('should reject non-admin users with 403 Forbidden', async () => {
      const req = new NextRequest('http://localhost/api/maintenance/sweep', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerToken}`,
        },
      });

      const res = await sweepRoute(req);
      expect(res.status).toBe(403);
    });

    it('should allow admin user to trigger maintenance sweep and return 200 with result payload', async () => {
      const req = new NextRequest('http://localhost/api/maintenance/sweep', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      const res = await sweepRoute(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.data).toBeDefined();
      expect(typeof json.data.expandedRequestsCount).toBe('number');
      expect(typeof json.data.expiredRequestsCount).toBe('number');
      expect(typeof json.data.autoOfflinedProvidersCount).toBe('number');
      expect(typeof json.data.timestamp).toBe('string');
    });
  });
});
