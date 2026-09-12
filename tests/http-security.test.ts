import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import {
  seedDatabase,
  SEED_CUSTOMER_ID,
  SEED_CUSTOMER_USER_ID,
  SEED_PROVIDER_1_ID,
  SEED_PROVIDER_2_ID,
  SEED_PROVIDER_4_ID,
  SEED_PROVIDER_FAR_ID,
  SEED_PROVIDER_BLOCKED_ID,
} from '../src/db/seed';
import { createAuthToken } from '../src/server/auth';
import { db } from '../src/db/client';
import { users, vehicles } from '../src/db/schema/index';
import { env } from '../src/lib/env';

import { POST as demoTokenRoute } from '../src/app/api/auth/demo-token/route';
import { POST as createRequestRoute } from '../src/app/api/requests/route';
import { GET as getRequestRoute } from '../src/app/api/requests/[id]/route';
import { POST as selectOfferRoute } from '../src/app/api/requests/[id]/select/route';
import { GET as getOffersRoute } from '../src/app/api/requests/[id]/offers/route';
import { POST as createOfferRoute } from '../src/app/api/offers/route';
import { GET as getOrderRoute } from '../src/app/api/orders/[id]/route';

describe('HTTP Security & Authorization Boundary Integration Tests', () => {
  let customerAToken: string;
  let customerBToken: string;
  let provider1Token: string;
  let provider2Token: string;
  let provider4Token: string; // Wrong capability
  let providerFarToken: string; // Outside radius
  let providerBlockedToken: string; // Blocked provider

  const customerAId = SEED_CUSTOMER_ID;
  const customerBId = 'c2000000-0000-0000-0000-000000000002';
  const provider1UserId = 'a1000000-0000-0000-0000-000000000001';
  const provider2UserId = 'a2000000-0000-0000-0000-000000000002';
  const provider4UserId = 'a4000000-0000-0000-0000-000000000004';
  const providerFarUserId = 'a6000000-0000-0000-0000-000000000006';
  const providerBlockedUserId = 'a8000000-0000-0000-0000-000000000008';

  beforeAll(async () => {
    await seedDatabase();

    // Create Customer B in DB
    await db.insert(users).values({
      id: customerBId,
      phone: '+77019998877',
      roles: ['motorist'],
      isBlocked: false,
    });

    // Generate valid tokens
    customerAToken = await createAuthToken({ sub: customerAId, phone: '+77011112233', roles: ['motorist'] });
    customerBToken = await createAuthToken({ sub: customerBId, phone: '+77019998877', roles: ['motorist'] });
    provider1Token = await createAuthToken({ sub: provider1UserId, phone: '+77021112233', roles: ['provider'] });
    provider2Token = await createAuthToken({ sub: provider2UserId, phone: '+77031112233', roles: ['provider'] });
    provider4Token = await createAuthToken({ sub: provider4UserId, phone: '+77051112233', roles: ['provider'] });
    providerFarToken = await createAuthToken({ sub: providerFarUserId, phone: '+77071112233', roles: ['provider'] });
    providerBlockedToken = await createAuthToken({ sub: providerBlockedUserId, phone: '+77091112233', roles: ['provider'] });
  });

  let createdRequestId: string;
  let submittedOffer1Id: string;
  let submittedOffer2Id: string;

  // -------------------------------------------------------------
  // DEMO TOKEN SECURITY TESTS (P0)
  // -------------------------------------------------------------
  describe('Demo Token Security & Whitelist Enforcement', () => {
    it('Allows minting demo token for whitelisted demo customer ID', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/demo-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: SEED_CUSTOMER_USER_ID }),
      });

      const res = await demoTokenRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.data.token).toBeDefined();
      expect(body.data.user.id).toBe(SEED_CUSTOMER_USER_ID);
    });

    it('Allows minting demo token for whitelisted demo provider ID', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/demo-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: SEED_PROVIDER_1_ID }),
      });

      const res = await demoTokenRoute(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.data.token).toBeDefined();
      expect(body.data.user.id).toBe(provider1UserId);
    });

    it('Rejects arbitrary unknown user UUID (403 Forbidden)', async () => {
      const randomUuid = '99999999-9999-9999-9999-999999999999';
      const req = new NextRequest('http://localhost:3000/api/auth/demo-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: randomUuid }),
      });

      const res = await demoTokenRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe('FORBIDDEN');
    });

    it('Rejects arbitrary existing non-demo user (403 Forbidden)', async () => {
      // customerBId exists in DB but is NOT on the demo whitelist
      const req = new NextRequest('http://localhost:3000/api/auth/demo-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: customerBId }),
      });

      const res = await demoTokenRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe('FORBIDDEN');
    });

    it('Rejects admin user UUID from demo token minting (403 Forbidden)', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/demo-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000000001' }),
      });

      const res = await demoTokenRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe('FORBIDDEN');
    });

    it('Production mode denies demo token endpoint unless explicitly enabled', async () => {
      const originalNodeEnv = env.NODE_ENV;
      const originalDemoMode = env.DEMO_MODE;

      try {
        // Simulate production environment with DEMO_MODE=false
        (env as { NODE_ENV: string }).NODE_ENV = 'production';
        (env as { DEMO_MODE: string }).DEMO_MODE = 'false';

        const req = new NextRequest('http://localhost:3000/api/auth/demo-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: SEED_CUSTOMER_USER_ID }),
        });

        const res = await demoTokenRoute(req);
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error?.code).toBe('FORBIDDEN');
      } finally {
        (env as { NODE_ENV: string }).NODE_ENV = originalNodeEnv;
        (env as { DEMO_MODE: string }).DEMO_MODE = originalDemoMode;
      }
    });
  });

  // -------------------------------------------------------------
  // AUTHENTICATION & TOKEN VERIFICATION TESTS
  // -------------------------------------------------------------
  describe('JWT Authentication & Error Handling', () => {
    it('Rejects request without Authorization header (401 Unauthorized)', async () => {
      const req = new NextRequest('http://localhost:3000/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: 'electrical_starting',
          location: { lat: 51.1283, lng: 71.4305 },
        }),
      });

      const res = await createRequestRoute(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error?.code).toBe('UNAUTHORIZED');
    });

    it('Rejects request with invalid or forged JWT (401 Unauthorized)', async () => {
      const req = new NextRequest('http://localhost:3000/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid.forged.jwt.token',
        },
        body: JSON.stringify({
          category: 'electrical_starting',
          location: { lat: 51.1283, lng: 71.4305 },
        }),
      });

      const res = await createRequestRoute(req);
      expect(res.status).toBe(401);
    });

    it('Rejects request with expired JWT (401 Unauthorized)', async () => {
      const expiredToken = await createAuthToken(
        { sub: customerAId, phone: '+77011112233', roles: ['motorist'] },
        '-1s' // Expired 1 second ago
      );

      const req = new NextRequest('http://localhost:3000/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${expiredToken}`,
        },
        body: JSON.stringify({
          category: 'electrical_starting',
          location: { lat: 51.1283, lng: 71.4305 },
        }),
      });

      const res = await createRequestRoute(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error?.code).toBe('UNAUTHORIZED');
    });

    it('Rejects JWT with unknown user subject (401 Unauthorized)', async () => {
      const nonExistentUserId = 'd9990000-0000-0000-0000-000000000099';
      const ghostToken = await createAuthToken({
        sub: nonExistentUserId,
        phone: '+77099990000',
        roles: ['motorist'],
      });

      const req = new NextRequest('http://localhost:3000/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ghostToken}`,
        },
        body: JSON.stringify({
          category: 'electrical_starting',
          location: { lat: 51.1283, lng: 71.4305 },
        }),
      });

      const res = await createRequestRoute(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error?.code).toBe('UNAUTHORIZED');
    });

    it('Rejects request from blocked user (403 Forbidden)', async () => {
      const req = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${providerBlockedToken}`,
        },
        body: JSON.stringify({
          requestId: '00000000-0000-0000-0000-000000000000',
          pricingMode: 'fixed',
          amountTiyn: 500000,
          etaMinutes: 20,
        }),
      });

      const res = await createOfferRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe('FORBIDDEN');
    });
  });

  // -------------------------------------------------------------
  // REQUEST CREATION & IDOR & LOCATION PRIVACY
  // -------------------------------------------------------------
  describe('Request Creation & Location Privacy', () => {
    it('User A creates request; customerId is bound from JWT and provider directory is not leaked', async () => {
      const req = new NextRequest('http://localhost:3000/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerAToken}`,
        },
        body: JSON.stringify({
          customerId: customerBId, // Forged customerId must be IGNORED
          category: 'electrical_starting',
          location: { lat: 51.1283, lng: 71.4305 },
          description: 'Машина заглохла на парковке',
        }),
      });

      const res = await createRequestRoute(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.data.requestId).toBeDefined();
      expect(body.data.matchedProvidersCount).toBeGreaterThanOrEqual(1);
      expect(body.data.matchedProviders).toBeUndefined();

      createdRequestId = body.data.requestId;
    });

    it('Rejects request creation with coordinates outside Astana boundaries (400 Bad Request)', async () => {
      const req = new NextRequest('http://localhost:3000/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerAToken}`,
        },
        body: JSON.stringify({
          category: 'electrical_starting',
          location: { lat: 43.238949, lng: 76.889709 }, // Almaty coordinates
          description: 'За пределами Астаны',
        }),
      });

      const res = await createRequestRoute(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('User A cannot attach User B vehicle to request (403 Forbidden)', async () => {
      const [vehicleB] = await db
        .insert(vehicles)
        .values({
          userId: customerBId,
          make: 'Toyota',
          model: 'Camry',
          year: 2019,
        })
        .returning();

      const req = new NextRequest('http://localhost:3000/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerAToken}`,
        },
        body: JSON.stringify({
          category: 'battery_jumpstart',
          location: { lat: 51.1283, lng: 71.4305 },
          vehicleId: vehicleB.id,
        }),
      });

      const res = await createRequestRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe('FORBIDDEN');
    });

    it('User B (unauthorized motorist) is rejected from reading User A request (403 Forbidden)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/requests/${createdRequestId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${customerBToken}`,
        },
      });

      const res = await getRequestRoute(req, { params: { id: createdRequestId } });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe('FORBIDDEN');
    });

    it('Matched Provider sees request with masked location before selection', async () => {
      const req = new NextRequest(`http://localhost:3000/api/requests/${createdRequestId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${provider1Token}`,
        },
      });

      const res = await getRequestRoute(req, { params: { id: createdRequestId } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(createdRequestId);
      expect(body.data.location).toBeNull();
    });

    it('Ineligible Provider (wrong capability) is rejected from reading request (403 Forbidden)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/requests/${createdRequestId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${provider4Token}`,
        },
      });

      const res = await getRequestRoute(req, { params: { id: createdRequestId } });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe('FORBIDDEN');
    });
  });

  // -------------------------------------------------------------
  // OFFER CREATION & PROVIDER BINDING & VISIBILITY
  // -------------------------------------------------------------
  describe('Offer Creation & SQL-Level Isolation', () => {
    it('Ineligible Provider (Wrong capability) rejected from submitting offer (403 Forbidden)', async () => {
      const req = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider4Token}`,
        },
        body: JSON.stringify({
          requestId: createdRequestId,
          pricingMode: 'fixed',
          amountTiyn: 500000,
          etaMinutes: 20,
        }),
      });

      const res = await createOfferRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe('FORBIDDEN');
    });

    it('Ineligible Provider (Outside radius) rejected from submitting offer (403 Forbidden)', async () => {
      const req = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${providerFarToken}`,
        },
        body: JSON.stringify({
          requestId: createdRequestId,
          pricingMode: 'fixed',
          amountTiyn: 500000,
          etaMinutes: 20,
        }),
      });

      const res = await createOfferRoute(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe('FORBIDDEN');
    });

    it('Eligible Provider 1 submits offer; providerId is bound server-side from JWT', async () => {
      const req = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider1Token}`,
        },
        body: JSON.stringify({
          requestId: createdRequestId,
          providerId: SEED_PROVIDER_2_ID, // Forged providerId must be IGNORED
          pricingMode: 'diagnostic_fee',
          amountTiyn: 500000,
          etaMinutes: 25,
          message: 'Выезжаю с оборудованием',
        }),
      });

      const res = await createOfferRoute(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.data.id).toBeDefined();
      expect(body.data.providerId).toBe(SEED_PROVIDER_1_ID);

      submittedOffer1Id = body.data.id;
    });

    it('Eligible Provider 2 submits second offer', async () => {
      const req = new NextRequest('http://localhost:3000/api/offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider2Token}`,
        },
        body: JSON.stringify({
          requestId: createdRequestId,
          pricingMode: 'fixed',
          amountTiyn: 800000,
          etaMinutes: 15,
          message: 'СТО Барыс на связи',
        }),
      });

      const res = await createOfferRoute(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe('ok');
      submittedOffer2Id = body.data.id;
    });

    it('Customer A sees ALL offers submitted for the request', async () => {
      const req = new NextRequest(`http://localhost:3000/api/requests/${createdRequestId}/offers`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${customerAToken}`,
        },
      });

      const res = await getOffersRoute(req, { params: { id: createdRequestId } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.length).toBe(2);
    });

    it('Provider 1 sees ONLY their own offer via SQL isolation (not Provider 2 offer)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/requests/${createdRequestId}/offers`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${provider1Token}`,
        },
      });

      const res = await getOffersRoute(req, { params: { id: createdRequestId } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].id).toBe(submittedOffer1Id);
      expect(body.data[0].providerId).toBe(SEED_PROVIDER_1_ID);
    });

    it('Unrelated Motorist B is rejected from viewing offers (403 Forbidden)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/requests/${createdRequestId}/offers`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${customerBToken}`,
        },
      });

      const res = await getOffersRoute(req, { params: { id: createdRequestId } });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe('FORBIDDEN');
    });
  });

  // -------------------------------------------------------------
  // SELECTION & ORDERS & POST-SELECTION LOCATION
  // -------------------------------------------------------------
  describe('Offer Selection & Post-Selection Location Privacy', () => {
    let createdOrderId: string;

    it('User B is rejected from selecting an offer on User A request (403 Forbidden)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/requests/${createdRequestId}/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerBToken}`,
        },
        body: JSON.stringify({
          offerId: submittedOffer1Id,
        }),
      });

      const res = await selectOfferRoute(req, { params: { id: createdRequestId } });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe('FORBIDDEN');
    });

    it('Customer A successfully selects Provider 1 offer', async () => {
      const req = new NextRequest(`http://localhost:3000/api/requests/${createdRequestId}/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerAToken}`,
        },
        body: JSON.stringify({
          offerId: submittedOffer1Id,
        }),
      });

      const res = await selectOfferRoute(req, { params: { id: createdRequestId } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.data.order.status).toBe('PROVIDER_SELECTED');
      expect(body.data.order.offerId).toBe(submittedOffer1Id);

      createdOrderId = body.data.order.id;
    });

    it('Customer B is rejected from accessing Customer A order (403 Forbidden)', async () => {
      const req = new NextRequest(`http://localhost:3000/api/orders/${createdOrderId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${customerBToken}`,
        },
      });

      const res = await getOrderRoute(req, { params: { id: createdOrderId } });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error?.code).toBe('FORBIDDEN');
    });

    it('Selected Provider 1 gets full request details with exact location after selection', async () => {
      const req = new NextRequest(`http://localhost:3000/api/requests/${createdRequestId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${provider1Token}`,
        },
      });

      const res = await getRequestRoute(req, { params: { id: createdRequestId } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.location).toBeDefined();
      expect(body.data.location.lat).toBeCloseTo(51.1283, 3);
      expect(body.data.location.lng).toBeCloseTo(71.4305, 3);
    });
  });

  // -------------------------------------------------------------
  // ROUTE PARAMETER VALIDATION (UUID)
  // -------------------------------------------------------------
  describe('Dynamic Route Parameter Validation', () => {
    const invalidId = 'not-a-valid-uuid-12345';

    it('GET /api/requests/[id] rejects non-UUID id with 400 VALIDATION_ERROR', async () => {
      const req = new NextRequest(`http://localhost:3000/api/requests/${invalidId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${customerAToken}` },
      });

      const res = await getRequestRoute(req, { params: { id: invalidId } });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/requests/[id]/offers rejects non-UUID id with 400 VALIDATION_ERROR', async () => {
      const req = new NextRequest(`http://localhost:3000/api/requests/${invalidId}/offers`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${customerAToken}` },
      });

      const res = await getOffersRoute(req, { params: { id: invalidId } });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/requests/[id]/select rejects non-UUID id with 400 VALIDATION_ERROR', async () => {
      const req = new NextRequest(`http://localhost:3000/api/requests/${invalidId}/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerAToken}`,
        },
        body: JSON.stringify({ offerId: '00000000-0000-0000-0000-000000000000' }),
      });

      const res = await selectOfferRoute(req, { params: { id: invalidId } });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/orders/[id] rejects non-UUID id with 400 VALIDATION_ERROR', async () => {
      const req = new NextRequest(`http://localhost:3000/api/orders/${invalidId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${customerAToken}` },
      });

      const res = await getOrderRoute(req, { params: { id: invalidId } });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error?.code).toBe('VALIDATION_ERROR');
    });
  });
});

