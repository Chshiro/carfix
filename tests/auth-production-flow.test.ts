import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '../src/db/client';
import { users, wallets, otpChallenges, sessions, providers } from '../src/db/schema/index';
import { eq, and, sql } from 'drizzle-orm';
import { normalizeKzPhone, validateKzPhone, maskPhone, formatKzPhone } from '../src/server/auth/phone';
import { generateSecureOtp, hashOtp, verifyOtpHash } from '../src/server/auth/otp';
import { getClientIp, hashIp } from '../src/server/auth/client-ip';
import {
  createSession,
  validateSessionToken,
  revokeSession,
  revokeAllUserSessions,
  createSessionCookie,
  clearSessionCookie,
  hashSessionToken,
} from '../src/server/auth/session';
import { validateCsrfOrigin } from '../src/server/auth/csrf';
import { MockSmsProvider, KazSmsProvider, ISmsProvider } from '../src/server/services/sms.service';
import { AuthService } from '../src/server/services/auth.service';
import { AppError, ForbiddenError, RateLimitError, UnauthorizedError, ValidationError } from '../src/server/errors';
import { env } from '../src/lib/env';

import { POST as requestOtpRoute } from '../src/app/api/auth/request-otp/route';
import { POST as verifyOtpRoute } from '../src/app/api/auth/verify-otp/route';
import { GET as meRoute } from '../src/app/api/auth/me/route';
import { POST as logoutRoute } from '../src/app/api/auth/logout/route';
import { POST as demoTokenRoute } from '../src/app/api/auth/demo-token/route';

describe('Production Authentication & Security Hardening Test Suite', () => {
  const testPhone1 = '+77015551234';
  const testPhone2 = '+77771234567';
  const testPhoneBlocked = '+77059998877';
  const testIp = '195.189.100.45';

  class TestMemorySmsProvider implements ISmsProvider {
    name = 'mock';
    public sentMessages: Array<{ phone: string; code: string }> = [];

    async sendOtp(phone: string, code: string): Promise<void> {
      this.sentMessages.push({ phone, code });
    }
  }

  let memorySms: TestMemorySmsProvider;

  beforeEach(async () => {
    memorySms = new TestMemorySmsProvider();
  });

  // =========================================================================
  // 1. PHONE NORMALIZATION & VALIDATION
  // =========================================================================
  describe('1. Phone Normalization, Validation & Masking', () => {
    it('normalizes valid +7 E.164 phone number', () => {
      expect(normalizeKzPhone('+77015551234')).toBe('+77015551234');
      expect(normalizeKzPhone('+77771234567')).toBe('+77771234567');
    });

    it('normalizes valid 8-prefixed Kazakhstan phone number', () => {
      expect(normalizeKzPhone('87015551234')).toBe('+77015551234');
      expect(normalizeKzPhone('87751112233')).toBe('+77751112233');
    });

    it('normalizes formatted phone number with spaces and brackets', () => {
      expect(normalizeKzPhone('+7 (701) 555-12-34')).toBe('+77015551234');
      expect(normalizeKzPhone('8 (777) 123 45 67')).toBe('+77771234567');
      expect(normalizeKzPhone('7702-999-88-77')).toBe('+77029998877');
    });

    it('normalizes 10-digit phone number without country prefix', () => {
      expect(normalizeKzPhone('7015551234')).toBe('+77015551234');
    });

    it('rejects foreign phone numbers (Russian +79, US +1, Belarus +375)', () => {
      expect(() => normalizeKzPhone('+79031234567')).toThrow(ValidationError);
      expect(() => normalizeKzPhone('+12125551234')).toThrow(ValidationError);
      expect(() => normalizeKzPhone('+375291234567')).toThrow(ValidationError);
    });

    it('rejects invalid DEF prefix codes for Kazakhstan', () => {
      expect(validateKzPhone('+77991234567')).toBe(false);
      expect(validateKzPhone('+77331234567')).toBe(false);
      expect(() => normalizeKzPhone('+77991234567')).toThrow(ValidationError);
    });

    it('rejects malformed and empty phone inputs', () => {
      expect(() => normalizeKzPhone('')).toThrow(ValidationError);
      expect(() => normalizeKzPhone('abcd')).toThrow(ValidationError);
      expect(() => normalizeKzPhone('+7701')).toThrow(ValidationError);
      expect(() => normalizeKzPhone('+7701123456789999')).toThrow(ValidationError);
    });

    it('masks phone correctly for safe display and logging', () => {
      expect(maskPhone('+77015551234')).toBe('+7 (701) ***-**-34');
      expect(maskPhone('+77771234567')).toBe('+7 (777) ***-**-67');
      expect(maskPhone('')).toBe('***');
    });

    it('formats phone into readable representation', () => {
      expect(formatKzPhone('+77015551234')).toBe('+7 (701) 555-12-34');
    });
  });

  // =========================================================================
  // 2. OTP MATHEMATICS & CRYPTOGRAPHIC HASHING
  // =========================================================================
  describe('2. OTP Cryptography & Constant-Time Hashing', () => {
    it('generates 6-digit cryptographically secure OTP', () => {
      for (let i = 0; i < 20; i++) {
        const otp = generateSecureOtp();
        expect(otp).toHaveLength(6);
        expect(/^\d{6}$/.test(otp)).toBe(true);
      }
    });

    it('computes deterministic HMAC-SHA256 hash', () => {
      const hash1 = hashOtp('+77015551234', '123456', 'secret_key_12345678901234567890123456');
      const hash2 = hashOtp('+77015551234', '123456', 'secret_key_12345678901234567890123456');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('produces different hashes for different phones or codes', () => {
      const h1 = hashOtp('+77015551234', '123456');
      const h2 = hashOtp('+77015551234', '123457');
      const h3 = hashOtp('+77771234567', '123456');
      expect(h1).not.toBe(h2);
      expect(h1).not.toBe(h3);
    });

    it('verifies correct OTP code in constant time', () => {
      const code = '654321';
      const hash = hashOtp('+77015551234', code);
      expect(verifyOtpHash('+77015551234', code, hash)).toBe(true);
    });

    it('rejects wrong OTP code or wrong phone in constant time', () => {
      const hash = hashOtp('+77015551234', '112233');
      expect(verifyOtpHash('+77015551234', '112234', hash)).toBe(false);
      expect(verifyOtpHash('+77771234567', '112233', hash)).toBe(false);
    });
  });

  // =========================================================================
  // 3. CLIENT IP RESOLUTION & PRIVACY HASHING
  // =========================================================================
  describe('3. Client IP Resolution & Hashing', () => {
    it('extracts IP from cf-connecting-ip or x-real-ip or x-forwarded-for', () => {
      const req1 = new Request('http://localhost', {
        headers: { 'cf-connecting-ip': '203.0.113.195' },
      });
      expect(getClientIp(req1)).toBe('203.0.113.195');

      const req2 = new Request('http://localhost', {
        headers: { 'x-real-ip': '198.51.100.4' },
      });
      expect(getClientIp(req2)).toBe('198.51.100.4');

      const req3 = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '192.0.2.1, 10.0.0.1' },
      });
      expect(getClientIp(req3)).toBe('192.0.2.1');
    });

    it('hashes IP into 64-char SHA256 string for privacy', () => {
      const hash = hashIp('192.168.1.1');
      expect(hash).toHaveLength(64);
      expect(hash).toBe(hashIp('192.168.1.1'));
    });
  });

  // =========================================================================
  // 4. CSRF ORIGIN VALIDATION
  // =========================================================================
  describe('4. CSRF Origin & Referer Validation', () => {
    it('allows safe GET requests without Origin', () => {
      const req = new Request('http://localhost:3000/api/auth/me', { method: 'GET' });
      expect(validateCsrfOrigin(req)).toBe(true);
    });

    it('allows POST request matching host', () => {
      const req = new Request('http://carfix.kz/api/auth/verify-otp', {
        method: 'POST',
        headers: {
          host: 'carfix.kz',
          origin: 'https://carfix.kz',
        },
      });
      expect(validateCsrfOrigin(req)).toBe(true);
    });

    it('allows localhost origin in development', () => {
      const req = new Request('http://localhost:3000/api/auth/request-otp', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
        },
      });
      expect(validateCsrfOrigin(req)).toBe(true);
    });

    it('rejects cross-site malicious origin', () => {
      const req = new Request('http://carfix.kz/api/auth/verify-otp', {
        method: 'POST',
        headers: {
          host: 'carfix.kz',
          origin: 'https://evil-attacker.com',
        },
      });
      expect(validateCsrfOrigin(req)).toBe(false);
    });
  });

  // =========================================================================
  // 5. SMS PROVIDER SAFETY & CONFIGURATION
  // =========================================================================
  describe('5. SMS Gateway & Mock Provider Production Guard', () => {
    it('allows MockSmsProvider in non-production', async () => {
      const mock = new MockSmsProvider();
      await expect(mock.sendOtp('+77015551234', '123456')).resolves.toBeUndefined();
    });

    it('KazSmsProvider initializes with API key', () => {
      const kaz = new KazSmsProvider('test_key', 'CarFix', 'https://mock.sms.kz');
      expect(kaz.name).toBe('kazsms');
    });
  });

  // =========================================================================
  // 6. COOKIE HELPERS & SESSION TOKENS
  // =========================================================================
  describe('6. Cookie Helpers & Session Token Hashing', () => {
    it('computes 64-char SHA256 session token hash', () => {
      const token = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
      const hash = hashSessionToken(token);
      expect(hash).toHaveLength(64);
    });

    it('creates HttpOnly session cookie string with Max-Age', () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000);
      const cookie = createSessionCookie('test_token', expiresAt);
      expect(cookie).toContain('carfix_session=test_token');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
    });

    it('clears session cookie with Max-Age=0', () => {
      const clearCookie = clearSessionCookie();
      expect(clearCookie).toContain('carfix_session=');
      expect(clearCookie).toContain('Max-Age=0');
      expect(clearCookie).toContain('HttpOnly');
    });
  });

  // =========================================================================
  // 7. END-TO-END AUTH SERVICE ORCHESTRATION & TRANSACTIONS
  // =========================================================================
  describe('7. AuthService OTP Lifecycle, User Provisioning & Sessions', () => {
    it('generates OTP challenge and dispatches SMS', async () => {
      const res = await AuthService.requestOtp(testPhone1, testIp, memorySms);

      expect(res.retryAfter).toBe(60);
      expect(res.expiresInSeconds).toBe(300);
      expect(memorySms.sentMessages).toHaveLength(1);
      expect(memorySms.sentMessages[0].phone).toBe(testPhone1);
      expect(memorySms.sentMessages[0].code).toHaveLength(6);
    });

    it('enforces 60-second cooldown on repeated OTP requests', async () => {
      // 1st request
      await AuthService.requestOtp(testPhone2, testIp, memorySms);

      // 2nd request immediately -> RateLimitError (429)
      await expect(AuthService.requestOtp(testPhone2, testIp, memorySms)).rejects.toThrow(
        RateLimitError
      );
    });

    it('fails verification on wrong OTP code and increments attempts', async () => {
      const uniquePhone = '+77011110001';
      await AuthService.requestOtp(uniquePhone, '10.0.0.1', memorySms);
      const correctCode = memorySms.sentMessages[memorySms.sentMessages.length - 1].code;

      // 1st wrong attempt
      await expect(AuthService.verifyOtp(uniquePhone, '000000', '10.0.0.1')).rejects.toThrow(
        UnauthorizedError
      );

      // 2nd wrong attempt
      await expect(AuthService.verifyOtp(uniquePhone, '000001', '10.0.0.1')).rejects.toThrow(
        UnauthorizedError
      );

      // 3rd wrong attempt -> locks OTP
      await expect(AuthService.verifyOtp(uniquePhone, '000002', '10.0.0.1')).rejects.toThrow(
        UnauthorizedError
      );

      // 4th attempt with correct code fails because challenge was exhausted/locked
      await expect(AuthService.verifyOtp(uniquePhone, correctCode, '10.0.0.1')).rejects.toThrow(
        UnauthorizedError
      );
    });

    it('successfully verifies correct OTP, provisions user with motorist role, and issues session', async () => {
      const newPhone = '+77017778899';
      await AuthService.requestOtp(newPhone, '10.0.0.2', memorySms);
      const sentCode = memorySms.sentMessages[memorySms.sentMessages.length - 1].code;

      const result = await AuthService.verifyOtp(newPhone, sentCode, '10.0.0.2');

      expect(result.sessionToken).toBeDefined();
      expect(result.sessionToken).toHaveLength(64);
      expect(result.user.phone).toBe(newPhone);
      expect(result.user.roles).toEqual(['motorist']);
      expect(result.user.isBlocked).toBe(false);

      // Verify user exists and can resolve session
      const resolved = await AuthService.resolveSession(result.sessionToken);
      expect(resolved).not.toBeNull();
      expect(resolved?.id).toBe(result.user.id);
      expect(resolved?.phone).toBe(newPhone);
      expect(resolved?.roles).toEqual(['motorist']);

      // Verify wallet was created atomically
      const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, result.user.id));
      expect(wallet).toBeDefined();
      expect(wallet.balanceTiyn).toBe(0);
    });

    it('rejects OTP reuse (single-use guarantee)', async () => {
      const singleUsePhone = '+77018889900';
      await AuthService.requestOtp(singleUsePhone, '10.0.0.3', memorySms);
      const code = memorySms.sentMessages[memorySms.sentMessages.length - 1].code;

      // 1st verify succeeds
      await AuthService.verifyOtp(singleUsePhone, code, '10.0.0.3');

      // 2nd verify with same code fails immediately
      await expect(AuthService.verifyOtp(singleUsePhone, code, '10.0.0.3')).rejects.toThrow(
        UnauthorizedError
      );
    });

    it('logs out and revokes server-side session', async () => {
      const logoutPhone = '+77019991122';
      await AuthService.requestOtp(logoutPhone, '10.0.0.4', memorySms);
      const code = memorySms.sentMessages[memorySms.sentMessages.length - 1].code;

      const verifyRes = await AuthService.verifyOtp(logoutPhone, code, '10.0.0.4');
      const token = verifyRes.sessionToken;

      // Session is active
      const beforeLogout = await AuthService.resolveSession(token);
      expect(beforeLogout).not.toBeNull();

      // Logout
      await AuthService.logout(token);

      // Session is now revoked
      const afterLogout = await AuthService.resolveSession(token);
      expect(afterLogout).toBeNull();
    });

    it('rejects blocked users during session validation', async () => {
      const blockedPhone = '+77015559988';
      await AuthService.requestOtp(blockedPhone, '10.0.0.5', memorySms);
      const code = memorySms.sentMessages[memorySms.sentMessages.length - 1].code;

      const verifyRes = await AuthService.verifyOtp(blockedPhone, code, '10.0.0.5');

      // Block user in DB
      await db.update(users).set({ isBlocked: true }).where(eq(users.id, verifyRes.user.id));

      // Subsequent session resolution throws ForbiddenError
      await expect(AuthService.resolveSession(verifyRes.sessionToken)).rejects.toThrow(
        ForbiddenError
      );
    });
  });

  // =========================================================================
  // 8. HTTP API ROUTE ENDPOINTS
  // =========================================================================
  describe('8. Next.js API Routes (request-otp, verify-otp, me, logout, demo-token)', () => {
    it('POST /api/auth/request-otp returns 200 with retryAfter', async () => {
      const req = new NextRequest('http://localhost/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+77012345678' }),
      });

      const res = await requestOtpRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('ok');
      expect(json.data.retryAfter).toBe(60);
    });

    it('POST /api/auth/verify-otp returns 200 and Set-Cookie header', async () => {
      const phone = '+77013456789';
      // Request OTP
      const req1 = new NextRequest('http://localhost/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const res1 = await requestOtpRoute(req1);
      const json1 = await res1.json();
      const code = json1.data.demoCode || '123456';

      // Verify OTP
      const req2 = new NextRequest('http://localhost/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const res2 = await verifyOtpRoute(req2);
      const json2 = await res2.json();

      expect(res2.status).toBe(200);
      expect(json2.status).toBe('ok');
      expect(json2.data.user.phone).toBe(phone);

      const setCookie = res2.headers.get('set-cookie');
      expect(setCookie).toContain('carfix_session=');
      expect(setCookie).toContain('HttpOnly');
    });

    it('GET /api/auth/me returns 401 when no session cookie is provided', async () => {
      const req = new NextRequest('http://localhost/api/auth/me', {
        method: 'GET',
      });
      const res = await meRoute(req);
      expect(res.status).toBe(401);
    });

    it('POST /api/auth/logout clears cookie and returns 200', async () => {
      const req = new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
      });
      const res = await logoutRoute(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.status).toBe('ok');
      const setCookie = res.headers.get('set-cookie');
      expect(setCookie).toContain('Max-Age=0');
    });

    it('POST /api/auth/demo-token is blocked in production mode', async () => {
      const originalEnv = env.NODE_ENV;
      (env as { NODE_ENV: string }).NODE_ENV = 'production';

      const req = new NextRequest('http://localhost/api/auth/demo-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'c0000000-0000-0000-0000-000000000001' }),
      });

      const res = await demoTokenRoute(req);
      expect(res.status).toBe(403);

      // Restore
      (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
    });

  });
});
