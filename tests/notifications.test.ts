import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  seedDatabase,
  SEED_CUSTOMER_ID,
  SEED_PROVIDER_1_ID,
} from '../src/db/seed';
import {
  NotificationService,
  MockNotificationDriver,
  KazakhstanSmsDriver,
  WhatsAppBusinessDriver,
} from '../src/server/services/notification.service';
import { createAuthToken } from '../src/server/auth';
import { POST as subscribeRoute } from '../src/app/api/notifications/subscribe/route';

describe('Stage 2: Communications, PWA & Omnichannel Notifications', () => {
  const customerUserId = SEED_CUSTOMER_ID;
  const mockDriver = new MockNotificationDriver();

  let customerToken: string;

  beforeAll(async () => {
    await seedDatabase();
    NotificationService.setDriver(mockDriver);

    customerToken = await createAuthToken({
      sub: customerUserId,
      phone: '+77011112233',
      roles: ['motorist'],
    });
  });

  beforeEach(async () => {
    mockDriver.clear();
  });

  describe('1. Driver Strategy (Mock, Kazakhstan SMS & WhatsApp Drivers)', () => {
    it('dispatches SMS through active driver and tracks sent messages', async () => {
      NotificationService.setDriver(mockDriver);

      const driver = NotificationService.getDriver();
      const sent = await driver.sendSms('+77011112233', 'Тестовое SMS');
      expect(sent).toBe(true);
      expect(mockDriver.sentSmsList.length).toBe(1);
      expect(mockDriver.sentSmsList[0].to).toBe('+77011112233');
      expect(mockDriver.sentSmsList[0].message).toBe('Тестовое SMS');
    });

    it('supports Kazakhstan SMS Driver and WhatsApp Business Driver implementations', async () => {
      const kzDriver = new KazakhstanSmsDriver('test_key');
      const kzSent = await kzDriver.sendSms('+77019998877', 'KZ Gateway SMS');
      expect(kzSent).toBe(true);

      const waDriver = new WhatsAppBusinessDriver('wa_token');
      const waSent = await waDriver.sendWhatsApp('+77019998877', 'order_update', { id: '123' });
      expect(waSent).toBe(true);

      // Restore mock driver
      NotificationService.setDriver(mockDriver);
    });
  });

  describe('2. Web Push Subscription Management & Storage', () => {
    it('registers and stores push subscription for user', async () => {
      const subId = await NotificationService.registerPushSubscription(customerUserId, {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-sub-1',
        p256dhKey: 'test_p256dh_key_data',
        authKey: 'test_auth_key_data',
        deviceType: 'WEB',
      });

      expect(subId).toBeDefined();

      // Dispatches web push
      const count = await NotificationService.sendWebPush(customerUserId, {
        title: '⚡ CarFix Тест',
        body: 'Тестовый пуш',
      });
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('updates existing subscription if endpoint matches', async () => {
      const subId1 = await NotificationService.registerPushSubscription(customerUserId, {
        endpoint: 'https://fcm.googleapis.com/fcm/send/duplicate-endpoint',
        p256dhKey: 'old_key',
        authKey: 'old_auth',
      });

      const subId2 = await NotificationService.registerPushSubscription(customerUserId, {
        endpoint: 'https://fcm.googleapis.com/fcm/send/duplicate-endpoint',
        p256dhKey: 'new_key',
        authKey: 'new_auth',
      });

      expect(subId1).toBe(subId2);
    });
  });

  describe('3. Trigger Notifications (Nearby Requests & Order Status Updates)', () => {
    it('notifies provider about new nearby request via push and SMS', async () => {
      const notified = await NotificationService.notifyNewNearbyRequest(SEED_PROVIDER_1_ID, {
        id: 'req-001',
        category: 'battery_jumpstart',
        distanceKm: 1.2,
      });

      expect(notified).toBe(true);
      expect(mockDriver.sentSmsList.length).toBeGreaterThanOrEqual(1);
      expect(mockDriver.sentSmsList[0].message).toContain('battery_jumpstart');
    });

    it('notifies customer about order progress (en_route, arrived, completed)', async () => {
      await NotificationService.notifyOrderStatusChanged(customerUserId, 'ord-001', 'EN_ROUTE', 'Мастер Азамат');

      expect(mockDriver.sentSmsList.length).toBeGreaterThanOrEqual(1);
      expect(mockDriver.sentSmsList[mockDriver.sentSmsList.length - 1].message).toContain('выехал');

      await NotificationService.notifyOrderStatusChanged(customerUserId, 'ord-001', 'COMPLETED');
      expect(mockDriver.sentSmsList[mockDriver.sentSmsList.length - 1].message).toContain('завершена');
    });
  });

  describe('4. HTTP API POST /api/notifications/subscribe', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = new NextRequest('http://localhost/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: 'https://fcm.googleapis.com/fcm/send/123',
          p256dhKey: 'abc',
          authKey: 'def',
        }),
      });
      const res = await subscribeRoute(req);
      expect(res.status).toBe(401);
    });

    it('registers push subscription via HTTP endpoint with 201 Created', async () => {
      const req = new NextRequest('http://localhost/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({
          endpoint: 'https://fcm.googleapis.com/fcm/send/http-sub-test',
          p256dhKey: 'key_http_1',
          authKey: 'auth_http_1',
          deviceType: 'WEB',
        }),
      });
      const res = await subscribeRoute(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.status).toBe('ok');
      expect(json.data.subscriptionId).toBeDefined();
    });
  });
});
