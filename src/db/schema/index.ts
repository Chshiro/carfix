import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  integer,
  text,
  customType,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// Custom PostGIS geography(Point, 4326) type for Drizzle
export const geographyPoint = customType<{
  data: { lng: number; lat: number };
  driverData: string;
}>({
  dataType() {
    return 'geography(Point, 4326)';
  },
  toDriver(value: { lng: number; lat: number }): string {
    return `SRID=4326;POINT(${value.lng} ${value.lat})`;
  },
  fromDriver(value: string | { lng: number; lat: number }): { lng: number; lat: number } {
    if (typeof value === 'object' && value !== null && 'lng' in value && 'lat' in value) {
      return { lng: Number(value.lng), lat: Number(value.lat) };
    }
    const str = String(value);
    const matches = str.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/i);
    if (matches) {
      return { lng: parseFloat(matches[1]), lat: parseFloat(matches[2]) };
    }
    if (/^[0-9a-fA-F]{42,}$/.test(str)) {
      const buf = Buffer.from(str, 'hex');
      const isLE = buf[0] === 1;
      const type = isLE ? buf.readUInt32LE(1) : buf.readUInt32BE(1);
      const hasSrid = (type & 0x20000000) !== 0;
      const offset = hasSrid ? 9 : 5;
      const lng = isLE ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);
      const lat = isLE ? buf.readDoubleLE(offset + 8) : buf.readDoubleBE(offset + 8);
      return { lng, lat };
    }
    return { lng: 0, lat: 0 };
  },
});

// Users table
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  roles: text('roles')
    .array()
    .notNull()
    .$type<string[]>(),
  isBlocked: boolean('is_blocked').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Provider profiles table
export const providers = pgTable(
  'providers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    businessName: varchar('business_name', { length: 150 }).notNull(),
    providerType: varchar('provider_type', { length: 50 }).notNull(), // STO | INDEPENDENT_MASTER | MOBILE_MASTER
    verificationLevel: varchar('verification_level', { length: 50 })
      .default('LEVEL_3_NEW_PROVIDER')
      .notNull(),
    description: text('description'),
    rating: integer('rating').default(0).notNull(), // Stored as aggregate * 100
    completedJobs: integer('completed_jobs').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('chk_providers_rating', sql`${table.rating} >= 0 AND ${table.rating} <= 500`),
    check('chk_providers_completed_jobs', sql`${table.completedJobs} >= 0`),
  ]
);

// Provider capabilities table
export const providerCapabilities = pgTable('provider_capabilities', {
  id: uuid('id').defaultRandom().primaryKey(),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id, { onDelete: 'cascade' }),
  capability: varchar('capability', { length: 50 }).notNull(), // BATTERY | AUTO_ELECTRIC | DIAGNOSTICS | MECHANICAL_MINOR
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Provider availability & spatial location table
export const providerAvailability = pgTable(
  'provider_availability',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' })
      .unique(),
    isOnline: boolean('is_online').default(false).notNull(),
    location: geographyPoint('location').notNull(),
    radiusKm: integer('radius_km').default(10).notNull(),
    locationUpdatedAt: timestamp('location_updated_at', { withTimezone: true }).defaultNow().notNull(),
    autoOfflineAt: timestamp('auto_offline_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_provider_availability_location').using('gist', table.location),
    check('chk_provider_availability_radius', sql`${table.radiusKm} >= 1 AND ${table.radiusKm} <= 100`),
  ]
);

// Provider service modes
export const providerServiceModes = pgTable('provider_service_modes', {
  id: uuid('id').defaultRandom().primaryKey(),
  providerId: uuid('provider_id')
    .notNull()
    .references(() => providers.id, { onDelete: 'cascade' }),
  serviceMode: varchar('service_mode', { length: 50 }).notNull(), // MOBILE | AT_LOCATION
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Vehicles table (optional)
export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    make: varchar('make', { length: 100 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    year: integer('year').notNull(),
    licensePlate: varchar('license_plate', { length: 20 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('chk_vehicles_year', sql`${table.year} >= 1950 AND ${table.year} <= 2100`),
  ]
);

// Service requests table
export const serviceRequests = pgTable(
  'service_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 50 }).notNull(), // electrical_starting | battery_jumpstart | mobile_mechanic
    requiredCapabilities: text('required_capabilities')
      .array()
      .notNull()
      .$type<string[]>(),
    vehicleId: uuid('vehicle_id').references(() => vehicles.id, { onDelete: 'set null' }),
    description: text('description'),
    location: geographyPoint('location').notNull(),
    status: varchar('status', { length: 50 }).default('PUBLISHED').notNull(), // DRAFT | PUBLISHED | OFFERS_RECEIVED | PROVIDER_SELECTED | ...
    currentRadiusKm: integer('current_radius_km').default(5).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    nextExpansionAt: timestamp('next_expansion_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_service_requests_location').using('gist', table.location),
    index('idx_service_requests_status_category').on(table.status, table.category),
    index('idx_service_requests_customer_created').on(table.customerId, table.createdAt),
    check('chk_service_requests_radius', sql`${table.currentRadiusKm} >= 1 AND ${table.currentRadiusKm} <= 100`),
  ]
);

// Provider offers table
export const providerOffers = pgTable(
  'provider_offers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => serviceRequests.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    pricingMode: varchar('pricing_mode', { length: 50 }).notNull(), // fixed | diagnostic_fee | estimate_range
    amountTiyn: integer('amount_tiyn'),
    minAmountTiyn: integer('min_amount_tiyn'),
    maxAmountTiyn: integer('max_amount_tiyn'),
    etaMinutes: integer('eta_minutes').notNull(),
    message: text('message'),
    status: varchar('status', { length: 50 }).default('SUBMITTED').notNull(), // SUBMITTED | ACCEPTED | REJECTED | WITHDRAWN
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_provider_offers_request_provider').on(table.requestId, table.providerId),
    index('idx_provider_offers_request_status').on(table.requestId, table.status),
    index('idx_provider_offers_provider').on(table.providerId, table.createdAt),
    check(
      'chk_provider_offers_eta',
      sql`${table.etaMinutes} >= 1 AND ${table.etaMinutes} <= 480`
    ),
    check(
      'chk_provider_offers_pricing',
      sql`(${table.pricingMode} IN ('fixed', 'diagnostic_fee') AND ${table.amountTiyn} IS NOT NULL AND ${table.amountTiyn} > 0 AND ${table.minAmountTiyn} IS NULL AND ${table.maxAmountTiyn} IS NULL) OR (${table.pricingMode} = 'estimate_range' AND ${table.minAmountTiyn} IS NOT NULL AND ${table.minAmountTiyn} > 0 AND ${table.maxAmountTiyn} IS NOT NULL AND ${table.maxAmountTiyn} >= ${table.minAmountTiyn} AND ${table.amountTiyn} IS NULL)`
    ),
  ]
);

// Orders table
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => serviceRequests.id, { onDelete: 'cascade' }),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => providerOffers.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 50 }).default('PROVIDER_SELECTED').notNull(),
    agreedPricingMode: varchar('agreed_pricing_mode', { length: 50 }).notNull(),
    agreedAmountTiyn: integer('agreed_amount_tiyn'),
    agreedMinTiyn: integer('agreed_min_tiyn'),
    agreedMaxTiyn: integer('agreed_max_tiyn'),
    finalAmountTiyn: integer('final_amount_tiyn'),
    cancellationReason: text('cancellation_reason'),
    cancelledBy: uuid('cancelled_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_orders_customer').on(table.customerId, table.createdAt),
    index('idx_orders_provider').on(table.providerId, table.createdAt),
    uniqueIndex('uq_orders_request').on(table.requestId),
  ]
);

// Order status history table
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: varchar('from_status', { length: 50 }),
    toStatus: varchar('to_status', { length: 50 }).notNull(),
    actorId: uuid('actor_id').notNull(),
    actorRole: varchar('actor_role', { length: 50 }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_order_status_history_order').on(table.orderId, table.createdAt),
  ]
);

// Reviews table (bidirectional rating)
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromUserId: uuid('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: uuid('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_reviews_order_from_user').on(table.orderId, table.fromUserId),
    index('idx_reviews_to_user').on(table.toUserId),
  ]
);

// Relations definitions
export const usersRelations = relations(users, ({ many, one }) => ({
  provider: one(providers, {
    fields: [users.id],
    references: [providers.userId],
  }),
  vehicles: many(vehicles),
  serviceRequests: many(serviceRequests),
  ordersAsCustomer: many(orders, { relationName: 'customerOrders' }),
  reviewsGiven: many(reviews, { relationName: 'reviewsGiven' }),
  reviewsReceived: many(reviews, { relationName: 'reviewsReceived' }),
}));

export const providersRelations = relations(providers, ({ one, many }) => ({
  user: one(users, {
    fields: [providers.userId],
    references: [users.id],
  }),
  capabilities: many(providerCapabilities),
  availability: one(providerAvailability, {
    fields: [providers.id],
    references: [providerAvailability.providerId],
  }),
  serviceModes: many(providerServiceModes),
  offers: many(providerOffers),
  orders: many(orders),
}));

export const serviceRequestsRelations = relations(serviceRequests, ({ one, many }) => ({
  customer: one(users, {
    fields: [serviceRequests.customerId],
    references: [users.id],
  }),
  vehicle: one(vehicles, {
    fields: [serviceRequests.vehicleId],
    references: [vehicles.id],
  }),
  offers: many(providerOffers),
  order: one(orders, {
    fields: [serviceRequests.id],
    references: [orders.requestId],
  }),
}));

export const providerOffersRelations = relations(providerOffers, ({ one }) => ({
  request: one(serviceRequests, {
    fields: [providerOffers.requestId],
    references: [serviceRequests.id],
  }),
  provider: one(providers, {
    fields: [providerOffers.providerId],
    references: [providers.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  request: one(serviceRequests, {
    fields: [orders.requestId],
    references: [serviceRequests.id],
  }),
  offer: one(providerOffers, {
    fields: [orders.offerId],
    references: [providerOffers.id],
  }),
  customer: one(users, {
    fields: [orders.customerId],
    references: [users.id],
    relationName: 'customerOrders',
  }),
  provider: one(providers, {
    fields: [orders.providerId],
    references: [providers.id],
  }),
  statusHistory: many(orderStatusHistory),
  reviews: many(reviews),
}));
