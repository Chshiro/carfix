import { db } from './client';
import {
  users,
  providers,
  providerCapabilities,
  providerAvailability,
  providerServiceModes,
  serviceRequests,
  providerOffers,
  orders,
  orderStatusHistory,
  reviews,
  disputes,
  adminAuditLogs,
  pushSubscriptions,
  wallets,
  transactions,
  paymentInvoices,
} from './schema/index';

export const SEED_CUSTOMER_ID = 'c0000000-0000-0000-0000-000000000001';
export const SEED_CUSTOMER_USER_ID = SEED_CUSTOMER_ID;

export const SEED_PROVIDER_1_USER_ID = 'a1000000-0000-0000-0000-000000000001';
export const SEED_PROVIDER_1_ID = 'b1000000-0000-0000-0000-000000000001';

export const SEED_PROVIDER_2_USER_ID = 'a2000000-0000-0000-0000-000000000002';
export const SEED_PROVIDER_2_ID = 'b2000000-0000-0000-0000-000000000002';

export const SEED_PROVIDER_3_USER_ID = 'a3000000-0000-0000-0000-000000000003';
export const SEED_PROVIDER_3_ID = 'b3000000-0000-0000-0000-000000000003';

export const SEED_PROVIDER_4_USER_ID = 'a4000000-0000-0000-0000-000000000004';
export const SEED_PROVIDER_4_ID = 'b4000000-0000-0000-0000-000000000004';

export const SEED_PROVIDER_5_USER_ID = 'a5000000-0000-0000-0000-000000000005';
export const SEED_PROVIDER_5_ID = 'b5000000-0000-0000-0000-000000000005';

export const SEED_PROVIDER_FAR_USER_ID = 'a6000000-0000-0000-0000-000000000006';
export const SEED_PROVIDER_FAR_ID = 'b6000000-0000-0000-0000-000000000006';

export const SEED_PROVIDER_OFFLINE_USER_ID = 'a7000000-0000-0000-0000-000000000007';
export const SEED_PROVIDER_OFFLINE_ID = 'b7000000-0000-0000-0000-000000000007';

export const SEED_PROVIDER_BLOCKED_USER_ID = 'a8000000-0000-0000-0000-000000000008';
export const SEED_PROVIDER_BLOCKED_ID = 'b8000000-0000-0000-0000-000000000008';

export const SEED_ADMIN_USER_ID = 'e0000000-0000-0000-0000-000000000001';

export const ALLOWED_DEMO_USER_IDS = new Set<string>([
  SEED_CUSTOMER_USER_ID,
  SEED_PROVIDER_1_USER_ID,
  SEED_PROVIDER_2_USER_ID,
  SEED_PROVIDER_3_USER_ID,
  SEED_PROVIDER_4_USER_ID,
  SEED_PROVIDER_5_USER_ID,
  SEED_PROVIDER_FAR_USER_ID,
  SEED_PROVIDER_OFFLINE_USER_ID,
  SEED_PROVIDER_BLOCKED_USER_ID,
  SEED_ADMIN_USER_ID,
]);

export const ALLOWED_DEMO_PROVIDER_IDS = new Set<string>([
  SEED_PROVIDER_1_ID,
  SEED_PROVIDER_2_ID,
  SEED_PROVIDER_3_ID,
  SEED_PROVIDER_4_ID,
  SEED_PROVIDER_5_ID,
  SEED_PROVIDER_FAR_ID,
  SEED_PROVIDER_OFFLINE_ID,
  SEED_PROVIDER_BLOCKED_ID,
]);

export async function seedDatabase() {
  console.info('🌱 Seeding database with Astana development data...');

  // Clean existing tables in reverse dependency order
  await db.delete(disputes);
  await db.delete(adminAuditLogs);
  await db.delete(pushSubscriptions);
  await db.delete(paymentInvoices);
  await db.delete(transactions);
  await db.delete(wallets);
  await db.delete(reviews);
  await db.delete(orderStatusHistory);
  await db.delete(orders);
  await db.delete(providerOffers);
  await db.delete(serviceRequests);
  await db.delete(providerServiceModes);
  await db.delete(providerAvailability);
  await db.delete(providerCapabilities);
  await db.delete(providers);
  await db.delete(users);

  const now = new Date();
  const autoOffline = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4 hours from now

  // 1. Create Customer
  await db.insert(users).values({
    id: SEED_CUSTOMER_ID,
    phone: '+77011112233',
    roles: ['motorist'],
    isBlocked: false,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Create Admin (Operations Team)
  await db.insert(users).values({
    id: SEED_ADMIN_USER_ID,
    phone: '+77000000000',
    roles: ['admin'],
    isBlocked: false,
    createdAt: now,
    updatedAt: now,
  });

  // Helper to create provider
  async function createProvider(
    userId: string,
    phone: string,
    providerId: string,
    businessName: string,
    type: 'STO' | 'INDEPENDENT_MASTER' | 'MOBILE_MASTER',
    level: string,
    rating: number,
    jobs: number,
    capabilities: string[],
    modes: string[],
    location: { lat: number; lng: number },
    isOnline: boolean = true,
    isBlocked: boolean = false,
    locationUpdatedAt: Date = now
  ) {
    await db.insert(users).values({
      id: userId,
      phone,
      roles: ['provider'],
      isBlocked,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(providers).values({
      id: providerId,
      userId,
      businessName,
      providerType: type,
      verificationLevel: level,
      description: `${businessName} — выездные автоуслуги в Астане`,
      rating,
      completedJobs: jobs,
      createdAt: now,
      updatedAt: now,
    });

    for (const cap of capabilities) {
      await db.insert(providerCapabilities).values({
        providerId,
        capability: cap,
        isActive: true,
        createdAt: now,
      });
    }

    for (const mode of modes) {
      await db.insert(providerServiceModes).values({
        providerId,
        serviceMode: mode,
        createdAt: now,
      });
    }

    await db.insert(providerAvailability).values({
      providerId,
      isOnline,
      location: { lat: location.lat, lng: location.lng },
      radiusKm: 15,
      locationUpdatedAt,
      autoOfflineAt: autoOffline,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Provider 1: Auto Electric + Battery (Esil, ~1.1 km from center)
  await createProvider(
    'a1000000-0000-0000-0000-000000000001',
    '+77021112233',
    SEED_PROVIDER_1_ID,
    'Мастер Азамат (Автоэлектрик / АКБ)',
    'INDEPENDENT_MASTER',
    'LEVEL_2_VERIFIED_MASTER',
    490, // 4.9
    42,
    ['AUTO_ELECTRIC', 'BATTERY'],
    ['MOBILE'],
    { lat: 51.135, lng: 71.432 }
  );

  // Provider 2: Auto Electric + Diagnostics (Esil / Saryarka, ~2.3 km)
  await createProvider(
    'a2000000-0000-0000-0000-000000000002',
    '+77031112233',
    SEED_PROVIDER_2_ID,
    'СТО Барыс (Диагностика / Электрика)',
    'STO',
    'LEVEL_1_VERIFIED_SERVICE',
    480, // 4.8
    115,
    ['AUTO_ELECTRIC', 'DIAGNOSTICS'],
    ['MOBILE', 'AT_LOCATION'],
    { lat: 51.14, lng: 71.42 }
  );

  // Provider 3: Battery Jumpstart Only (~0.6 km from Baiterek)
  await createProvider(
    'a3000000-0000-0000-0000-000000000003',
    '+77041112233',
    SEED_PROVIDER_3_ID,
    'Срочная Прикурка Астана (Бауыржан)',
    'MOBILE_MASTER',
    'LEVEL_2_VERIFIED_MASTER',
    500, // 5.0
    78,
    ['BATTERY'],
    ['MOBILE'],
    { lat: 51.125, lng: 71.435 }
  );

  // Provider 4: Minor Mechanic Only (~3.1 km)
  await createProvider(
    'a4000000-0000-0000-0000-000000000004',
    '+77051112233',
    SEED_PROVIDER_4_ID,
    'Мобильный Механик Данияр',
    'INDEPENDENT_MASTER',
    'LEVEL_2_VERIFIED_MASTER',
    470, // 4.7
    31,
    ['MECHANICAL_MINOR'],
    ['MOBILE'],
    { lat: 51.11, lng: 71.445 }
  );

  // Provider 5: Auto Electric + Minor Mechanic (~1.9 km)
  await createProvider(
    'a5000000-0000-0000-0000-000000000005',
    '+77061112233',
    SEED_PROVIDER_5_ID,
    'Универсал Автопомощь (Тимур)',
    'INDEPENDENT_MASTER',
    'LEVEL_2_VERIFIED_MASTER',
    490, // 4.9
    64,
    ['AUTO_ELECTRIC', 'MECHANICAL_MINOR'],
    ['MOBILE'],
    { lat: 51.12, lng: 71.415 }
  );

  // Provider 6: Far away (Kosshy / outside 5km radius, ~25 km)
  await createProvider(
    'a6000000-0000-0000-0000-000000000006',
    '+77071112233',
    SEED_PROVIDER_FAR_ID,
    'СТО Косшы (Вне радиуса 5км)',
    'STO',
    'LEVEL_1_VERIFIED_SERVICE',
    450,
    18,
    ['AUTO_ELECTRIC', 'BATTERY'],
    ['MOBILE'],
    { lat: 51.3, lng: 71.6 }
  );

  // Provider 7: Offline Provider
  await createProvider(
    'a7000000-0000-0000-0000-000000000007',
    '+77081112233',
    SEED_PROVIDER_OFFLINE_ID,
    'Автоэлектрик (Статус: Оффлайн)',
    'INDEPENDENT_MASTER',
    'LEVEL_2_VERIFIED_MASTER',
    480,
    25,
    ['AUTO_ELECTRIC', 'BATTERY'],
    ['MOBILE'],
    { lat: 51.13, lng: 71.43 },
    false // offline
  );

  // Provider 8: Blocked Provider
  await createProvider(
    'a8000000-0000-0000-0000-000000000008',
    '+77091112233',
    SEED_PROVIDER_BLOCKED_ID,
    'Заблокированный Сервис',
    'STO',
    'LEVEL_3_NEW_PROVIDER',
    200,
    5,
    ['AUTO_ELECTRIC', 'BATTERY'],
    ['MOBILE'],
    { lat: 51.13, lng: 71.43 },
    true,
    true // isBlocked = true
  );

  console.info('✅ Seed completed successfully with 8 test providers and 1 customer.');
}

if (process.argv[1]?.includes('seed')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seed failed:', err);
      process.exit(1);
    });
}
