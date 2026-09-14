import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';
import { env } from '../lib/env';

const isPooler = env.DATABASE_URL.includes('-pooler') || env.DATABASE_URL.includes('sslmode=require');

// Connection pool for queries
const queryClient = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === 'production' ? 10 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: !isPooler,
  ssl: env.DATABASE_URL.includes('sslmode=require') ? 'require' : undefined,
});

export const db = drizzle(queryClient, { schema });
export { queryClient };
