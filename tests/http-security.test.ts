import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import {
  seedDatabase,
  SEED_CUSTOMER_ID,
  SEED_PROVIDER_1_ID,
  SEED_PROVIDER_4_ID,
  SEED_PROVIDER_FAR_ID,
  SEED_PROVIDER_BLOCKED_ID,
} from '../src/db/seed';
import { createAuthToken } from '../src/server/auth';
import { db } from '../src/db/client';
import { users, vehicles, providers } from '../src/db/schema/index';
import { eq } from 'drizzle-orm';

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
  let provider4Token: string; // Wrong capability
  let providerFarToken: string; // Outside radius
  let providerBlockedToken: string; // Blocked provider

  const customerAId = SEED_CUSTOMER_ID;
  const customerBId = 'c2000000-0000-0000-0000-000000000002';
  const provider1UserId = 'a1000000-0000-0000-0000-000000000001';
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
    provider4Token = await createAuthToken({ sub: provider4UserId, phone: '+77051112233', roles: ['provider'] });
    providerFarToken = await createAuthToken({ sub: providerFarUserId, phone: '+77071112233', roles: ['provider'] });
    providerBlockedToken = await createAuthToken({ sub: providerBlockedUserId, phone: '+77091112233', roles: ['provider'] });
  });

  let createdRequestId: string;
  let submittedOfferId: string;

  // Test H: Missing Auth Token
  it('H. Rejects request without Authorization header (401 Unauthorized)', async () => {
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

  // Test I: Invalid / Forged JWT Token
  it('I. Rejects request with invalid or forged JWT (401 Unauthorized)', async () => {
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

  // Test A: User A creates request with valid JWT
  it('A. User A creates request; customerId is bound from JWT and provider directory is not leaked', async () => {
    const req = new NextRequest('http://localhost:3000/api/requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerAToken}`,
      },
      body: JSON.stringify({
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
    // Verified: matched provider identities MUST NOT be exposed
    expect(body.data.matchedProviders).toBeUndefined();

    createdRequestId = body.data.requestId;
  });

  // Test J: Vehicle Ownership Validation
  it('J. User A cannot attach User B vehicle to request (403 Forbidden)', async () => {
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

  // Test B: User B tries GET /api/requests/:id -> 403 Forbidden
  it('B. User B (unauthorized motorist) is rejected from reading User A request (403 Forbidden)', async () => {
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

  // Test Location Privacy: Matched Provider sees masked location before selection
  it('K1. Matched Provider sees request with masked location before selection', async () => {
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
    // Verified: exact location is masked (null) before selection
    expect(body.data.location).toBeNull();
  });

  // Test D & E: Ineligible Provider (Wrong capability) tries to submit offer -> 403
  it('E1. Provider without matching capability is rejected from submitting offer (403 Forbidden)', async () => {
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

  // Test E2: Ineligible Provider (Outside radius) tries to submit offer -> 403
  it('E2. Provider outside matching radius is rejected from submitting offer (403 Forbidden)', async () => {
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

  // Test F: Blocked Provider tries to submit offer -> 403
  it('F. Blocked provider is rejected from submitting offer (403 Forbidden)', async () => {
    const req = new NextRequest('http://localhost:3000/api/offers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerBlockedToken}`,
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
  });

  // Test D: Eligible Provider 1 submits valid offer
  it('D. Eligible Provider 1 submits offer; providerId is bound server-side from JWT', async () => {
    const req = new NextRequest('http://localhost:3000/api/offers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider1Token}`,
      },
      body: JSON.stringify({
        requestId: createdRequestId,
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

    submittedOfferId = body.data.id;
  });

  // Test C: User B tries POST /api/requests/:id/select -> 403 Forbidden
  it('C. User B is rejected from selecting an offer on User A request (403 Forbidden)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/requests/${createdRequestId}/select`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerBToken}`,
      },
      body: JSON.stringify({
        offerId: submittedOfferId,
      }),
    });

    const res = await selectOfferRoute(req, { params: { id: createdRequestId } });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  let createdOrderId: string;

  // Customer A selects offer successfully
  it('User A successfully selects Provider 1 offer', async () => {
    const req = new NextRequest(`http://localhost:3000/api/requests/${createdRequestId}/select`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerAToken}`,
      },
      body: JSON.stringify({
        offerId: submittedOfferId,
      }),
    });

    const res = await selectOfferRoute(req, { params: { id: createdRequestId } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.data.order.status).toBe('PROVIDER_SELECTED');

    createdOrderId = body.data.order.id;
  });

  // Test G: Customer B tries to access Customer A's order -> 403 Forbidden
  it('G. Customer B is rejected from accessing Customer A order (403 Forbidden)', async () => {
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

  // Test K2: Selected Provider now sees exact customer location
  it('K2. Selected Provider gets full request details with exact location after selection', async () => {
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
