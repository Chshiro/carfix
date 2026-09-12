import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '../src/db/client';
import {
  users,
  providers,
  serviceRequests,
  providerOffers,
  orders,
  reviews,
} from '../src/db/schema/index';
import { CustomerService } from '../src/server/services/customer.service';
import { POST as phoneLoginHandler } from '../src/app/api/auth/phone-login/route';
import { GET as activeStateHandler } from '../src/app/api/customer/active/route';
import { GET as ordersHistoryHandler } from '../src/app/api/customer/orders/route';
import { createAuthToken } from '../src/server/auth';
import { seedDatabase } from '../src/db/seed';

describe('Slice 5: Customer MVP Lifecycle, Phone Auth & Hydration', () => {
  beforeEach(async () => {
    await seedDatabase();
  });

  describe('1. Phone Authentication & Normalization (POST /api/auth/phone-login)', () => {
    it('normalizes Kazakhstani phone formats properly', () => {
      expect(CustomerService.normalizePhone('+7 (701) 123-45-67')).toBe('+77011234567');
      expect(CustomerService.normalizePhone('87029998877')).toBe('+77029998877');
      expect(CustomerService.normalizePhone('77051112233')).toBe('+77051112233');
      expect(CustomerService.normalizePhone('7771234567')).toBe('+77771234567');
    });

    it('rejects invalid phone numbers with less than 10 digits', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/phone-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '12345' }),
      });

      const res = await phoneLoginHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('creates new motorist account on first phone login and returns valid JWT', async () => {
      const testPhone = '+7 (708) 555-44-33';
      const req = new NextRequest('http://localhost:3000/api/auth/phone-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone }),
      });

      const res = await phoneLoginHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.data.token).toBeDefined();
      expect(json.data.user.phone).toBe('+77085554433');
      expect(json.data.user.roles).toContain('motorist');
    });

    it('logs into existing user account on subsequent logins', async () => {
      const phone = '+77011112233'; // Default seeded customer
      const req = new NextRequest('http://localhost:3000/api/auth/phone-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const res = await phoneLoginHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.user.id).toBe('c0000000-0000-0000-0000-000000000001');
    });
  });

  describe('2. Active State Hydration (GET /api/customer/active)', () => {
    it('returns IDLE state when customer has no active requests or orders', async () => {
      // Create a fresh user
      const loginRes = await CustomerService.phoneLogin('+77098887766');
      const token = loginRes.token;

      const req = new NextRequest('http://localhost:3000/api/customer/active', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await activeStateHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.type).toBe('IDLE');
    });

    it('hydrates active published request with submitted offers', async () => {
      const customerId = 'c0000000-0000-0000-0000-000000000001';
      const token = await createAuthToken({
        sub: customerId,
        phone: '+77011112233',
        roles: ['motorist'],
      });

      // Insert an active request
      const [newReq] = await db
        .insert(serviceRequests)
        .values({
          customerId,
          category: 'battery_jumpstart',
          requiredCapabilities: ['BATTERY'],
          description: 'Сел аккумулятор возле Хан Шатыра',
          location: { lat: 51.132, lng: 71.403 },
          status: 'PUBLISHED',
          currentRadiusKm: 5,
          expiresAt: new Date(Date.now() + 20 * 60 * 1000),
          nextExpansionAt: new Date(Date.now() + 3 * 60 * 1000),
        })
        .returning();

      // Insert an offer from Master Azamat
      await db.insert(providerOffers).values({
        requestId: newReq.id,
        providerId: 'b1000000-0000-0000-0000-000000000001',
        pricingMode: 'fixed',
        amountTiyn: 500000,
        etaMinutes: 15,
        message: 'Выезжаю сразу со стартером',
        status: 'SUBMITTED',
      });

      const req = new NextRequest('http://localhost:3000/api/customer/active', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await activeStateHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.type).toBe('REQUEST');
      expect(json.data.request.id).toBe(newReq.id);
      expect(json.data.offers).toHaveLength(1);
      expect(json.data.offers[0].businessName).toBe('Мастер Азамат (Автоэлектрик / АКБ)');
    });

    it('hydrates active order and provider contact info when order is in progress', async () => {
      const customerId = 'c0000000-0000-0000-0000-000000000001';
      const token = await createAuthToken({
        sub: customerId,
        phone: '+77011112233',
        roles: ['motorist'],
      });

      // Insert request
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

      // Insert offer
      const [offerRecord] = await db
        .insert(providerOffers)
        .values({
          requestId: reqRecord.id,
          providerId: 'b1000000-0000-0000-0000-000000000001',
          pricingMode: 'fixed',
          amountTiyn: 700000,
          etaMinutes: 10,
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
          providerId: 'b1000000-0000-0000-0000-000000000001',
          status: 'IN_PROGRESS',
          agreedPricingMode: 'fixed',
          agreedAmountTiyn: 700000,
        })
        .returning();

      const req = new NextRequest('http://localhost:3000/api/customer/active', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await activeStateHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.type).toBe('ORDER');
      expect(json.data.order.id).toBe(orderRecord.id);
      expect(json.data.order.status).toBe('IN_PROGRESS');
      expect(json.data.provider.phone).toBe('+77021112233');
      expect(json.data.provider.businessName).toBe('Мастер Азамат (Автоэлектрик / АКБ)');
    });
  });

  describe('3. Customer Orders History (GET /api/customer/orders)', () => {
    it('returns history of orders with receipts and review statuses', async () => {
      const customerId = 'c0000000-0000-0000-0000-000000000001';
      const token = await createAuthToken({
        sub: customerId,
        phone: '+77011112233',
        roles: ['motorist'],
      });

      // Insert request & completed order with review
      const [reqRecord] = await db
        .insert(serviceRequests)
        .values({
          customerId,
          category: 'battery_jumpstart',
          requiredCapabilities: ['BATTERY'],
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
          providerId: 'b3000000-0000-0000-0000-000000000003',
          pricingMode: 'fixed',
          amountTiyn: 450000,
          etaMinutes: 12,
          status: 'ACCEPTED',
        })
        .returning();

      const [orderRecord] = await db
        .insert(orders)
        .values({
          requestId: reqRecord.id,
          offerId: offerRecord.id,
          customerId,
          providerId: 'b3000000-0000-0000-0000-000000000003',
          status: 'COMPLETED',
          agreedPricingMode: 'fixed',
          agreedAmountTiyn: 450000,
          finalAmountTiyn: 450000,
        })
        .returning();

      await db.insert(reviews).values({
        orderId: orderRecord.id,
        fromUserId: customerId,
        toUserId: 'a3000000-0000-0000-0000-000000000003',
        rating: 5,
        comment: 'Очень быстро помог завестись!',
      });

      const req = new NextRequest('http://localhost:3000/api/customer/orders', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const res = await ordersHistoryHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe(orderRecord.id);
      expect(json.data[0].finalAmountTiyn).toBe(450000);
      expect(json.data[0].review.rating).toBe(5);
      expect(json.data[0].provider.businessName).toBe('Срочная Прикурка Астана (Бауыржан)');
    });
  });
});
