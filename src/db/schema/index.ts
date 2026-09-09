import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  integer,
  text,
  customType,
} from 'drizzle-orm/pg-core';

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
  fromDriver(value: string): { lng: number; lat: number } {
    // Parse POINT(lng lat) or binary representation
    const matches = value.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/i);
    if (matches) {
      return { lng: parseFloat(matches[1]), lat: parseFloat(matches[2]) };
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
export const providers = pgTable('providers', {
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
});
