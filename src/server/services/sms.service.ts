import { env } from '../../lib/env';
import { AppError } from '../errors';
import { maskPhone } from '../auth/phone';

export interface ISmsProvider {
  name: string;
  sendOtp(phone: string, code: string): Promise<void>;
}

/**
 * Mock SMS Provider for local development and test execution.
 * CRITICAL SAFETY: Fails immediately if invoked in a production environment.
 */
export class MockSmsProvider implements ISmsProvider {
  name = 'mock';

  constructor() {
    if (env.NODE_ENV === 'production') {
      throw new AppError(
        'CRITICAL CONFIGURATION ERROR: MockSmsProvider is strictly forbidden in production!',
        500,
        'INVALID_SMS_CONFIG'
      );
    }
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    if (env.NODE_ENV === 'production') {
      throw new AppError(
        'CRITICAL SECURITY VIOLATION: Cannot use Mock SMS provider in production',
        500,
        'SECURITY_VIOLATION'
      );
    }

    if (env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.log(`[SMS MOCK] Sent 6-digit OTP to ${maskPhone(phone)} (Code: ${code})`);
    }

  }
}

/**
 * Kazakhstan SMS REST Gateway Provider (Mobizon / SMS.kz / KazInfoTech)
 * Uses HTTP POST with 5000ms timeout and structured error handling.
 */
export class KazSmsProvider implements ISmsProvider {
  name = 'kazsms';
  private apiKey: string;
  private sender: string;
  private baseUrl: string;

  constructor(apiKey?: string, sender?: string, baseUrl?: string) {
    this.apiKey = apiKey || env.SMS_API_KEY || '';
    this.sender = sender || env.SMS_SENDER || 'CarFix';
    this.baseUrl = baseUrl || env.SMS_BASE_URL || 'https://api.mobizon.kz/service/message/sendSmsMessage';

    if (env.NODE_ENV === 'production' && !this.apiKey) {
      throw new AppError(
        'SMS_API_KEY must be configured in production environment',
        500,
        'INVALID_SMS_CONFIG'
      );
    }
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    const text = `Код подтверждения CarFix: ${code}. Никому не сообщайте.`;
    const cleanPhone = phone.replace(/\D/g, '');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const url = new URL(this.baseUrl);
      url.searchParams.set('apiKey', this.apiKey);
      url.searchParams.set('recipient', cleanPhone);
      url.searchParams.set('text', text);
      if (this.sender) {
        url.searchParams.set('from', this.sender);
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        console.error(`[KazSmsProvider] Failed with HTTP ${response.status}: ${errorBody.slice(0, 100)}`);
        throw new AppError('Ошибка доставки SMS через шлюз оператора', 502, 'SMS_GATEWAY_ERROR');
      }
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      console.error(`[KazSmsProvider] Network error sending SMS to ${maskPhone(phone)}:`, (err as Error).message);
      throw new AppError('Не удалось отправить SMS с кодом. Пожалуйста, повторите попытку.', 502, 'SMS_GATEWAY_ERROR');
    }
  }
}

/**
 * Factory for creating SMS Provider instance based on environment configuration
 */
export function getSmsProvider(): ISmsProvider {
  const providerType = env.SMS_PROVIDER;

  if (providerType === 'kazsms' || providerType === 'sms_kz') {
    return new KazSmsProvider();
  }

  return new MockSmsProvider();
}
