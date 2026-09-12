import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  seedDatabase,
  SEED_CUSTOMER_ID,
  SEED_PROVIDER_1_ID,
  SEED_PROVIDER_2_ID,
  SEED_ADMIN_USER_ID,
} from '../src/db/seed';
import { RequestService } from '../src/server/services/request.service';
import { OfferService } from '../src/server/services/offer.service';
import { OrderService } from '../src/server/services/order.service';
import { AdminService } from '../src/server/services/admin.service';
import { AuthUser, createAuthToken } from '../src/server/auth';
import { db } from '../src/db/client';
import { providers, users } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';

import { GET as getMetricsRoute } from '../src/app/api/admin/metrics/route';
import { GET as getProvidersRoute } from '../src/app/api/admin/providers/route';
import { PATCH as verifyProviderRoute } from '../src/app/api/admin/providers/[id]/verify/route';
import { GET as getOrdersRoute } from '../src/app/api/admin/orders/route';

describe('Slice 4: Admin Operations, Live Marketplace Monitor & Provider Verification', () => {
  const customerUserId = SEED_CUSTOMER_ID;
  const provider1UserId = 'a1000000-0000-0000-0000-000000000001';
  const adminUserId = SEED_ADMIN_USER_ID;

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

  let customerToken: string;
  let providerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await seedDatabase();

    customerToken = await createAuthToken({
      sub: customerUserId,
      phone: '+77011112233',
      roles: ['motorist'],
    });

    providerToken = await createAuthToken({
      sub: provider1UserId,
      phone: '+77021112233',
      roles: ['provider'],
    });

    adminToken = await createAuthToken({
      sub: adminUserId,
      phone: '+77000000000',
      roles: ['admin'],
    });
  });

  beforeEach(async () => {
    await seedDatabase();
  });

  describe('1. HTTP Security & Authorization Boundaries for Admin Routes', () => {
    it('GET /api/admin/metrics: 401 when unauthenticated, 403 for non-admin, 200 for admin', async () => {
      // 1. Unauthenticated -> 401
      const unauthReq = new NextRequest('http://localhost/api/admin/metrics', { method: 'GET' });
      const unauthRes = await getMetricsRoute(unauthReq);
      expect(unauthRes.status).toBe(401);

      // 2. Customer -> 403
      const custReq = new NextRequest('http://localhost/api/admin/metrics', {
        method: 'GET',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      const custRes = await getMetricsRoute(custReq);
      expect(custRes.status).toBe(403);

      // 3. Provider -> 403
      const provReq = new NextRequest('http://localhost/api/admin/metrics', {
        method: 'GET',
        headers: { Authorization: `Bearer ${providerToken}` },
      });
      const provRes = await getMetricsRoute(provReq);
      expect(provRes.status).toBe(403);

      // 4. Admin -> 200
      const adminReq = new NextRequest('http://localhost/api/admin/metrics', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const adminRes = await getMetricsRoute(adminReq);
      expect(adminRes.status).toBe(200);
      const json = await adminRes.json();
      expect(json.status).toBe('ok');
      expect(json.data.totalProvidersCount).toBeGreaterThanOrEqual(8);
    });

    it('GET /api/admin/providers: 403 for non-admin, 200 for admin with capability lists', async () => {
      const custReq = new NextRequest('http://localhost/api/admin/providers', {
        method: 'GET',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      const custRes = await getProvidersRoute(custReq);
      expect(custRes.status).toBe(403);

      const adminReq = new NextRequest('http://localhost/api/admin/providers', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const adminRes = await getProvidersRoute(adminReq);
      expect(adminRes.status).toBe(200);
      const json = await adminRes.json();
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(8);
      expect(json.data[0].capabilities).toBeDefined();
    });

    it('PATCH /api/admin/providers/[id]/verify: input validation and authorization', async () => {
      // Non-admin -> 403
      const nonAdminReq = new NextRequest(`http://localhost/api/admin/providers/${SEED_PROVIDER_1_ID}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({ verificationLevel: 'LEVEL_1_VERIFIED_SERVICE' }),
      });
      const nonAdminRes = await verifyProviderRoute(nonAdminReq, { params: { id: SEED_PROVIDER_1_ID } });
      expect(nonAdminRes.status).toBe(403);

      // Invalid UUID -> 400
      const badIdReq = new NextRequest('http://localhost/api/admin/providers/not-a-uuid/verify', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ verificationLevel: 'LEVEL_1_VERIFIED_SERVICE' }),
      });
      const badIdRes = await verifyProviderRoute(badIdReq, { params: { id: 'not-a-uuid' } });
      expect(badIdRes.status).toBe(400);

      // Invalid verification level -> 400
      const badLevelReq = new NextRequest(`http://localhost/api/admin/providers/${SEED_PROVIDER_1_ID}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ verificationLevel: 'INVALID_LEVEL' }),
      });
      const badLevelRes = await verifyProviderRoute(badLevelReq, { params: { id: SEED_PROVIDER_1_ID } });
      expect(badLevelRes.status).toBe(400);
    });
  });

  describe('2. Provider Verification Elevation & Account Suspension', () => {
    it('elevates provider verification level and updates database record', async () => {
      // 1. Elevate Provider 1 to LEVEL_1_VERIFIED_SERVICE
      const req = new NextRequest(`http://localhost/api/admin/providers/${SEED_PROVIDER_1_ID}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ verificationLevel: 'LEVEL_1_VERIFIED_SERVICE' }),
      });

      const res = await verifyProviderRoute(req, { params: { id: SEED_PROVIDER_1_ID } });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.verificationLevel).toBe('LEVEL_1_VERIFIED_SERVICE');

      // Verify in DB
      const [prov] = await db.select().from(providers).where(eq(providers.id, SEED_PROVIDER_1_ID));
      expect(prov.verificationLevel).toBe('LEVEL_1_VERIFIED_SERVICE');
    });

    it('blocks and unblocks provider user account', async () => {
      // Block provider 2
      const blockReq = new NextRequest(`http://localhost/api/admin/providers/${SEED_PROVIDER_2_ID}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ isBlocked: true }),
      });
      const blockRes = await verifyProviderRoute(blockReq, { params: { id: SEED_PROVIDER_2_ID } });
      expect(blockRes.status).toBe(200);

      const [prov2] = await db.select().from(providers).where(eq(providers.id, SEED_PROVIDER_2_ID));
      const [user2] = await db.select().from(users).where(eq(users.id, prov2.userId));
      expect(user2.isBlocked).toBe(true);

      // Unblock provider 2
      const unblockReq = new NextRequest(`http://localhost/api/admin/providers/${SEED_PROVIDER_2_ID}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ isBlocked: false }),
      });
      const unblockRes = await verifyProviderRoute(unblockReq, { params: { id: SEED_PROVIDER_2_ID } });
      expect(unblockRes.status).toBe(200);

      const [user2After] = await db.select().from(users).where(eq(users.id, prov2.userId));
      expect(user2After.isBlocked).toBe(false);
    });
  });

  describe('3. Marketplace Metrics & Live Order Monitoring', () => {
    it('accurately computes active requests, active orders, and completed GMV', async () => {
      // 1. Initial metrics
      const initialMetrics = await AdminService.getMarketplaceMetrics();
      expect(initialMetrics.activeRequestsCount).toBe(0);
      expect(initialMetrics.activeOrdersCount).toBe(0);

      // 2. Create request -> activeRequestsCount increases
      const reqRes = await RequestService.createRequest(
        { category: 'battery_jumpstart', location: { lat: 51.128, lng: 71.4305 } },
        mockCustomer
      );
      const reqId = reqRes.request.id;

      let metrics = await AdminService.getMarketplaceMetrics();
      expect(metrics.activeRequestsCount).toBe(1);

      // 3. Create offer and select -> activeOrdersCount increases
      const offer = await OfferService.createOffer(
        { requestId: reqId, pricingMode: 'fixed', amountTiyn: 800000, etaMinutes: 15 },
        mockProvider1
      );
      const selRes = await OrderService.selectOffer({ requestId: reqId, offerId: offer.id }, mockCustomer);
      const orderId = selRes.order.id;

      metrics = await AdminService.getMarketplaceMetrics();
      expect(metrics.activeOrdersCount).toBe(1);

      // 4. Complete order -> completedOrdersCount and GMV increase
      await OrderService.updateOrderStatus(orderId, { status: 'EN_ROUTE' }, mockProvider1);
      await OrderService.updateOrderStatus(orderId, { status: 'ARRIVED' }, mockProvider1);
      await OrderService.updateOrderStatus(orderId, { status: 'IN_PROGRESS' }, mockProvider1);
      await OrderService.updateOrderStatus(
        orderId,
        { status: 'COMPLETED', finalAmountTiyn: 800000 },
        mockProvider1
      );

      metrics = await AdminService.getMarketplaceMetrics();
      expect(metrics.activeOrdersCount).toBe(0);
      expect(metrics.completedOrdersCount).toBe(1);
      expect(metrics.totalGmvTiyn).toBe(800000);

      // 5. Query GET /api/admin/orders
      const ordersReq = new NextRequest('http://localhost/api/admin/orders?status=COMPLETED', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const ordersRes = await getOrdersRoute(ordersReq);
      expect(ordersRes.status).toBe(200);
      const ordersJson = await ordersRes.json();
      expect(ordersJson.data.length).toBe(1);
      expect(ordersJson.data[0].id).toBe(orderId);
      expect(ordersJson.data[0].finalAmountTiyn).toBe(800000);
      expect(ordersJson.data[0].category).toBe('battery_jumpstart');
    });
  });

  describe('4. Dispatch Map & Active Order Locations (GET /api/admin/dispatch/map)', () => {
    it('returns active orders with customer and provider coordinates for map clustering', async () => {
      // 1. Create active order in progress
      const reqRes = await RequestService.createRequest(
        { category: 'battery_jumpstart', location: { lat: 51.128, lng: 71.4305 } },
        mockCustomer
      );
      const offer = await OfferService.createOffer(
        { requestId: reqRes.request.id, pricingMode: 'fixed', amountTiyn: 500000, etaMinutes: 10 },
        mockProvider1
      );
      const selRes = await OrderService.selectOffer({ requestId: reqRes.request.id, offerId: offer.id }, mockCustomer);
      await OrderService.updateOrderStatus(selRes.order.id, { status: 'EN_ROUTE' }, mockProvider1);

      const mapReq = new NextRequest('http://localhost/api/admin/dispatch/map', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const { GET: getDispatchMap } = await import('../src/app/api/admin/dispatch/map/route');
      const mapRes = await getDispatchMap(mapReq);
      expect(mapRes.status).toBe(200);

      const json = await mapRes.json();
      expect(json.status).toBe('ok');
      expect(Array.isArray(json.data.activeOrders)).toBe(true);
      expect(json.data.activeOrders.length).toBe(1);
      expect(json.data.activeOrders[0].customer.location.lat).toBe(51.128);
      expect(json.data.activeOrders[0].customer.location.lng).toBe(71.4305);
      expect(json.data.activeOrders[0].provider.businessName).toBeDefined();
    });
  });

  describe('5. Master Verification Flow & Pending Queue', () => {
    it('filters pending masters and allows admin verification with audit log', async () => {
      const { GET: getPendingMasters } = await import('../src/app/api/admin/masters/pending/route');
      const { PATCH: verifyMaster } = await import('../src/app/api/admin/masters/[id]/verify/route');

      // 1. Check pending masters
      const pendingReq = new NextRequest('http://localhost/api/admin/masters/pending', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const pendingRes = await getPendingMasters(pendingReq);
      expect(pendingRes.status).toBe(200);
      const pendingJson = await pendingRes.json();
      expect(Array.isArray(pendingJson.data)).toBe(true);

      // 2. Verify Master 1
      const verifyReq = new NextRequest(`http://localhost/api/admin/masters/${SEED_PROVIDER_1_ID}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          verificationStatus: 'VERIFIED',
          verificationLevel: 'LEVEL_1_VERIFIED_SERVICE',
        }),
      });
      const verifyRes = await verifyMaster(verifyReq, { params: { id: SEED_PROVIDER_1_ID } });
      expect(verifyRes.status).toBe(200);
      const verifiedJson = await verifyRes.json();
      expect(verifiedJson.data.verificationStatus).toBe('VERIFIED');
      expect(verifiedJson.data.verificationLevel).toBe('LEVEL_1_VERIFIED_SERVICE');
    });
  });

  describe('6. Dispute Arbitration & Resolution Lifecycle', () => {
    it('creates dispute and resolves it with refund resolution notes and audit tracking', async () => {
      const { POST: createDispute, GET: getDisputes } = await import('../src/app/api/admin/disputes/route');
      const { POST: resolveDispute } = await import('../src/app/api/admin/disputes/[id]/resolve/route');

      // 1. Create order
      const reqRes = await RequestService.createRequest(
        { category: 'electrical_starting', location: { lat: 51.128, lng: 71.4305 } },
        mockCustomer
      );
      const offer = await OfferService.createOffer(
        { requestId: reqRes.request.id, pricingMode: 'fixed', amountTiyn: 700000, etaMinutes: 15 },
        mockProvider1
      );
      const selRes = await OrderService.selectOffer({ requestId: reqRes.request.id, offerId: offer.id }, mockCustomer);
      const orderId = selRes.order.id;

      // 2. Customer opens dispute
      const openReq = new NextRequest('http://localhost/api/admin/disputes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({
          orderId,
          reason: 'Мастер не приехал в указанное время ETA',
        }),
      });
      const openRes = await createDispute(openReq);
      expect(openRes.status).toBe(201);
      const openJson = await openRes.json();
      const disputeId = openJson.data.id;
      expect(disputeId).toBeDefined();

      // 3. Admin views disputes
      const listReq = new NextRequest('http://localhost/api/admin/disputes', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const listRes = await getDisputes(listReq);
      expect(listRes.status).toBe(200);
      const listJson = await listRes.json();
      expect(listJson.data.some((d: { id: string }) => d.id === disputeId)).toBe(true);

      // 4. Admin resolves dispute with refund
      const resolveReq = new NextRequest(`http://localhost/api/admin/disputes/${disputeId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          resolution: 'RESOLVED_REFUND',
          refundAmountTiyn: 700000,
          notes: 'Полный возврат средств клиенту из-за срыва ETA',
        }),
      });
      const resolveRes = await resolveDispute(resolveReq, { params: { id: disputeId } });
      expect(resolveRes.status).toBe(200);
      const resolveJson = await resolveRes.json();
      expect(resolveJson.data.status).toBe('RESOLVED_REFUND');
      expect(resolveJson.data.refundAmountTiyn).toBe(700000);
      expect(resolveJson.data.resolvedAt).toBeDefined();
    });
  });
});
