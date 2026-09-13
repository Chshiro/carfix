import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  text,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './index';

// OTP Challenges table for crypto-hashed OTP management
export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    phone: varchar('phone', { length: 20 }).notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    ipHash: varchar('ip_hash', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_otp_challenges_phone_created').on(table.phone, table.createdAt),
    index('idx_otp_challenges_expires').on(table.expiresAt),
    index('idx_otp_challenges_ip_created').on(table.ipHash, table.createdAt),
  ]
);

// Server-Side Sessions table (opaque token hash)
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionTokenHash: varchar('session_token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_sessions_token_hash').on(table.sessionTokenHash),
    index('idx_sessions_user_id').on(table.userId),
    index('idx_sessions_expires').on(table.expiresAt),
  ]
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
