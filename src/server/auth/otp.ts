import crypto from 'node:crypto';
import { env } from '../../lib/env';

/**
 * Generates a cryptographically secure 6-digit OTP code (000000 - 999999)
 */
export function generateSecureOtp(): string {
  const codeInt = crypto.randomInt(0, 1000000);
  return codeInt.toString().padStart(6, '0');
}

/**
 * Computes HMAC-SHA256 hash for phone + code challenge
 * Formula: HMAC-SHA256(OTP_HMAC_SECRET, canonicalPhone + ":" + otp)
 */
export function hashOtp(phone: string, code: string, secret?: string): string {
  const hmacSecret = secret || env.OTP_HMAC_SECRET;
  const message = `${phone.trim()}:${code.trim()}`;
  return crypto.createHmac('sha256', hmacSecret).update(message).digest('hex');
}

/**
 * Verifies OTP code against stored HMAC-SHA256 hash in constant time
 * preventing timing side-channel attacks.
 */
export function verifyOtpHash(
  phone: string,
  code: string,
  storedHash: string,
  secret?: string
): boolean {
  if (!phone || !code || !storedHash) {
    return false;
  }

  const computedHash = hashOtp(phone, code, secret);

  const storedBuffer = Buffer.from(storedHash, 'hex');
  const computedBuffer = Buffer.from(computedHash, 'hex');

  if (storedBuffer.length !== computedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedBuffer, computedBuffer);
}
