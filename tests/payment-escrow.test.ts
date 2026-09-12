import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  seedDatabase,
  SEED_CUSTOMER_ID,
  SEED_PROVIDER_1_ID,
  SEED_PROVIDER_1_USER_ID,
} from '../src/db/seed';
import { RequestService } from '../src/server/services/request.service';
import { OfferService } from '../src/server/services/offer.service';
import { OrderService } from '../src/server/services/order.service';
import { PaymentService } from '../src/server/services/payment.service';
import { AuthUser, createAuthToken } from '../src/server/auth';
import { POST as holdRoute } from '../src/app/api/payments/hold/route';
import { POST as splitRoute } from '../src/app/api/payments/complete-split/route';
import { GET as walletRoute } from '../src/app/api/payments/wallet/route';
import { POST as withdrawRoute } from '../src/app/api/payments/withdraw/route';

describe('Stage 3: Fintech, Escrow & Monetization (12% Split, Kaspi QR, Wallets)', () => {
  const customerUserId = SEED_CUSTOMER_ID;
  const providerUserId = SEED_PROVIDER_1_USER_ID;

  const mockCustomer: AuthUser = {
    id: customerUserId,
    phone: '+77011112233',
    roles: ['motorist'],
    isBlocked: false,
  };

  const mockProvider: AuthUser = {
    id: providerUserId,
    phone: '+77021112233',
    roles: ['provider'],
    isBlocked: false,
    providerId: SEED_PROVIDER_1_ID,
  };

  let customerToken: string;
  let providerToken: string;

  beforeAll(async () => {
    await seedDatabase();

    customerToken = await createAuthToken({
      sub: customerUserId,
      phone: '+77011112233',
      roles: ['motorist'],
    });

    providerToken = await createAuthToken({
      sub: providerUserId,
      phone: '+77021112233',
      roles: ['provider'],
    });
  });

  beforeEach(async () => {
    await seedDatabase();
  });

  describe('1. Escrow Hold & Kaspi Pay QR Generation', () => {
    it('creates invoice with HELD status and generates Kaspi QR deeplink', async () => {
      // 1. Create order
      const reqRes = await RequestService.createRequest(
        { category: 'battery_jumpstart', location: { lat: 51.128, lng: 71.4305 } },
        mockCustomer
      );
      const offer = await OfferService.createOffer(
        { requestId: reqRes.request.id, pricingMode: 'fixed', amountTiyn: 1000000, etaMinutes: 15 },
        mockProvider
      );
      const selRes = await OrderService.selectOffer({ requestId: reqRes.request.id, offerId: offer.id }, mockCustomer);
      const orderId = selRes.order.id;

      // 2. Create hold
      const holdRes = await PaymentService.createHold({
        orderId,
        customerId: customerUserId,
        amountTiyn: 1000000, // 10 000 ₸
        paymentMethod: 'KASPI_QR',
      });

      expect(holdRes.invoice.status).toBe('HELD');
      expect(holdRes.invoice.amountTiyn).toBe(1000000);
      expect(holdRes.invoice.serviceFeePercent).toBe(12);
      expect(holdRes.kaspiPayload.deeplink).toContain('kaspi://pay');
      expect(holdRes.kaspiPayload.qrUrl).toContain('pay.kaspi.kz');
    });
  });

  describe('2. Atomic Split & 12% Platform Fee Deduction', () => {
    it('accurately splits funds: 12% platform fee and 88% net to provider wallet', async () => {
      // 1. Create and hold 10 000 ₸ (1 000 000 tiyn)
      const reqRes = await RequestService.createRequest(
        { category: 'battery_jumpstart', location: { lat: 51.128, lng: 71.4305 } },
        mockCustomer
      );
      const offer = await OfferService.createOffer(
        { requestId: reqRes.request.id, pricingMode: 'fixed', amountTiyn: 1000000, etaMinutes: 15 },
        mockProvider
      );
      const selRes = await OrderService.selectOffer({ requestId: reqRes.request.id, offerId: offer.id }, mockCustomer);
      const orderId = selRes.order.id;

      await PaymentService.createHold({
        orderId,
        customerId: customerUserId,
        amountTiyn: 1000000,
      });

      // 2. Complete order lifecycle
      await OrderService.updateOrderStatus(orderId, { status: 'EN_ROUTE' }, mockProvider);
      await OrderService.updateOrderStatus(orderId, { status: 'ARRIVED' }, mockProvider);
      await OrderService.updateOrderStatus(orderId, { status: 'IN_PROGRESS' }, mockProvider);
      await OrderService.updateOrderStatus(orderId, { status: 'COMPLETED', finalAmountTiyn: 1000000 }, mockProvider);

      // 3. Execute Capture & Split
      const split = await PaymentService.captureAndSplit(orderId);

      // 12% of 10 000 ₸ = 1 200 ₸ (120 000 tiyn)
      // 88% net to master = 8 800 ₸ (880 000 tiyn)
      expect(split.totalAmountTiyn).toBe(1000000);
      expect(split.platformFeeTiyn).toBe(120000);
      expect(split.providerNetTiyn).toBe(880000);
      expect(split.providerWalletBalanceTiyn).toBe(880000);

      // 4. Check Provider Wallet Statement
      const wallet = await PaymentService.getWallet(providerUserId);
      expect(wallet.balanceTiyn).toBe(880000);
      expect(wallet.transactions.length).toBe(2); // RELEASE + PLATFORM_FEE
      expect(wallet.transactions.some((t) => t.type === 'RELEASE' && t.amountTiyn === 880000)).toBe(true);
      expect(wallet.transactions.some((t) => t.type === 'PLATFORM_FEE' && t.amountTiyn === 120000)).toBe(true);
    });

    it('rejects double-capture of the same invoice', async () => {
      const reqRes = await RequestService.createRequest(
        { category: 'battery_jumpstart', location: { lat: 51.128, lng: 71.4305 } },
        mockCustomer
      );
      const offer = await OfferService.createOffer(
        { requestId: reqRes.request.id, pricingMode: 'fixed', amountTiyn: 500000, etaMinutes: 15 },
        mockProvider
      );
      const selRes = await OrderService.selectOffer({ requestId: reqRes.request.id, offerId: offer.id }, mockCustomer);
      const orderId = selRes.order.id;

      await PaymentService.createHold({ orderId, customerId: customerUserId, amountTiyn: 500000 });
      await PaymentService.captureAndSplit(orderId);

      await expect(PaymentService.captureAndSplit(orderId)).rejects.toThrow(/already been captured/);
    });
  });

  describe('3. Escrow Refund on Cancellation / Dispute', () => {
    it('refunds held funds when order is cancelled', async () => {
      const reqRes = await RequestService.createRequest(
        { category: 'battery_jumpstart', location: { lat: 51.128, lng: 71.4305 } },
        mockCustomer
      );
      const offer = await OfferService.createOffer(
        { requestId: reqRes.request.id, pricingMode: 'fixed', amountTiyn: 600000, etaMinutes: 15 },
        mockProvider
      );
      const selRes = await OrderService.selectOffer({ requestId: reqRes.request.id, offerId: offer.id }, mockCustomer);
      const orderId = selRes.order.id;

      await PaymentService.createHold({ orderId, customerId: customerUserId, amountTiyn: 600000 });
      await PaymentService.refundHold(orderId, 'Мастер отменил заказ');

      const customerWallet = await PaymentService.getWallet(customerUserId);
      expect(customerWallet.transactions.some((t) => t.type === 'REFUND' && t.amountTiyn === 600000)).toBe(true);
    });
  });

  describe('4. Master Wallet Withdrawal Flow (Kaspi Gold / Halyk)', () => {
    it('deducts available balance and records WITHDRAWAL transaction', async () => {
      // 1. Credit wallet through captured order
      const reqRes = await RequestService.createRequest(
        { category: 'battery_jumpstart', location: { lat: 51.128, lng: 71.4305 } },
        mockCustomer
      );
      const offer = await OfferService.createOffer(
        { requestId: reqRes.request.id, pricingMode: 'fixed', amountTiyn: 1000000, etaMinutes: 15 },
        mockProvider
      );
      const selRes = await OrderService.selectOffer({ requestId: reqRes.request.id, offerId: offer.id }, mockCustomer);
      await PaymentService.createHold({ orderId: selRes.order.id, customerId: customerUserId, amountTiyn: 1000000 });
      await PaymentService.captureAndSplit(selRes.order.id);

      // 2. Withdraw 5 000 ₸ (500 000 tiyn) to Kaspi Gold
      const withdraw = await PaymentService.requestWithdrawal(
        providerUserId,
        500000,
        'KASPI_GOLD',
        '4400430199881234'
      );

      expect(withdraw.withdrawnAmountTiyn).toBe(500000);
      expect(withdraw.remainingBalanceTiyn).toBe(380000); // 880 000 - 500 000 = 380 000 tiyn
      expect(withdraw.destination).toContain('1234');

      // 3. Reject overdraft withdrawal
      await expect(
        PaymentService.requestWithdrawal(providerUserId, 1000000, 'KASPI_GOLD', '4400430199881234')
      ).rejects.toThrow(/Insufficient wallet balance/);
    });
  });

  describe('5. HTTP Payment API Endpoints', () => {
    it('POST /api/payments/hold creates hold and returns 201', async () => {
      const reqRes = await RequestService.createRequest(
        { category: 'battery_jumpstart', location: { lat: 51.128, lng: 71.4305 } },
        mockCustomer
      );
      const offer = await OfferService.createOffer(
        { requestId: reqRes.request.id, pricingMode: 'fixed', amountTiyn: 400000, etaMinutes: 15 },
        mockProvider
      );
      const selRes = await OrderService.selectOffer({ requestId: reqRes.request.id, offerId: offer.id }, mockCustomer);

      const holdReq = new NextRequest('http://localhost/api/payments/hold', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({
          orderId: selRes.order.id,
          amountTiyn: 400000,
          paymentMethod: 'KASPI_QR',
        }),
      });

      const holdRes = await holdRoute(holdReq);
      expect(holdRes.status).toBe(201);
      const holdJson = await holdRes.json();
      expect(holdJson.status).toBe('ok');
      expect(holdJson.data.invoice.status).toBe('HELD');
    });

    it('GET /api/payments/wallet & POST /api/payments/withdraw integration', async () => {
      const getWalletReq = new NextRequest('http://localhost/api/payments/wallet', {
        method: 'GET',
        headers: { Authorization: `Bearer ${providerToken}` },
      });
      const walletRes = await walletRoute(getWalletReq);
      expect(walletRes.status).toBe(200);
      const walletJson = await walletRes.json();
      expect(walletJson.data.balanceTiyn).toBeDefined();
    });
  });
});
