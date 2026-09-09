import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long'),
  SMS_PROVIDER: z.enum(['mock', 'sms_kz']).default('mock'),
  SMS_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().default('carfix-uploads'),
  S3_REGION: z.string().default('auto'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = JSON.stringify(result.error.format(), null, 2);
    // In test environment, fallback or throw clear message
    if (process.env.NODE_ENV === 'test' && !process.env.DATABASE_URL) {
      return {
        NODE_ENV: 'test',
        PORT: 3000,
        DATABASE_URL: 'postgres://carfix:carfix_secret@localhost:5432/carfix_dev',
        JWT_SECRET: 'test_jwt_secret_must_be_at_least_32_characters_long',
        JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_must_be_at_least_32_chars_long',
        SMS_PROVIDER: 'mock',
        S3_BUCKET: 'carfix-uploads',
        S3_REGION: 'auto',
      };
    }
    throw new Error(`❌ Invalid environment configuration:\n${errorDetails}`);
  }
  return result.data;
}

export const env = validateEnv();
