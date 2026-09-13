import { eq, and, desc, gt, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { otpChallenges, sessions, users, wallets, providers } from '../../db/schema/index';
import { env } from '../../lib/env';
import { AppError, ForbiddenError, RateLimitError, UnauthorizedError, ValidationError } from '../errors';
import { normalizeKzPhone, validateKzPhone, maskPhone } from '../auth/phone';
import { generateSecureOtp, hashOtp, verifyOtpHash } from '../auth/otp';
import { hashIp } from '../auth/client-ip';
import { createSession, revokeSession, validateSessionToken } from '../auth/session';
import { getSmsProvider, ISmsProvider } from './sms.service';
import { AuthUser } from '../auth';

export interface RequestOtpResult {
  retryAfter: number;
  expiresInSeconds: number;
  demoCode?: string;
}

export interface VerifyOtpResult {
  sessionToken: string;
  expiresAt: Date;
  user: {
    id: string;
    phone: string;
    roles: string[];
    isBlocked: boolean;
    providerId?: string;
  };
}

export class AuthService {
  /**
   * 1. Requests a 6-digit OTP code for Kazakhstan phone number.
   * Atomically checks cooldown (60s), IP limits, invalidates previous OTP,
   * stores HMAC hash in PostgreSQL, and dispatches SMS.
   */
  static async requestOtp(
    rawPhone: string,
    clientIp: string,
    smsProvider?: ISmsProvider
  ): Promise<RequestOtpResult> {
    const phone = normalizeKzPhone(rawPhone);
    const ipHash = hashIp(clientIp);
    const now = new Date();
    const cooldownSeconds = env.AUTH_OTP_COOLDOWN_SECONDS;
    const ttlSeconds = env.AUTH_OTP_TTL_SECONDS;
    const maxAttempts = env.AUTH_OTP_MAX_ATTEMPTS;

    const provider = smsProvider || getSmsProvider();
    const isNonProd = env.NODE_ENV !== 'production' || env.DEMO_MODE === 'true';

    // In dev/test with mock provider, fixed code 123456 or secure random
    const code = isNonProd && provider.name === 'mock' ? '123456' : generateSecureOtp();
    const codeHash = hashOtp(phone, code);
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    await db.transaction(async (tx) => {
      // 1. IP Rate Limiting (past 1 hour)
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const [ipCountRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(otpChallenges)
        .where(
          and(
            eq(otpChallenges.ipHash, ipHash),
            gte(otpChallenges.createdAt, oneHourAgo)
          )
        );

      const ipRequestsCount = Number(ipCountRow?.count || 0);
      const isTestEnv = env.NODE_ENV === 'test' || process.env.VITEST === 'true';
      const ipLimit = isTestEnv ? 1000 : env.AUTH_IP_HOURLY_LIMIT;
      if (ipRequestsCount >= ipLimit) {
        throw new RateLimitError(
          'Превышен лимит запросов с вашего IP-адреса. Повторите попытку позже.',
          3600
        );
      }

      // 2. Phone Cooldown (SELECT FOR UPDATE on most recent challenge for phone)
      const [recentChallenge] = await tx
        .select()
        .from(otpChallenges)
        .where(eq(otpChallenges.phone, phone))
        .orderBy(desc(otpChallenges.createdAt))
        .limit(1)
        .for('update');

      if (recentChallenge) {
        const elapsedSeconds = Math.floor(
          (now.getTime() - new Date(recentChallenge.createdAt).getTime()) / 1000
        );
        if (elapsedSeconds < cooldownSeconds) {
          const remainingSeconds = cooldownSeconds - elapsedSeconds;
          throw new RateLimitError(
            `Повторная отправка кода возможна через ${remainingSeconds} сек.`,
            remainingSeconds
          );
        }
      }

      // 3. Invalidate any lingering active challenges for this phone
      await tx
        .update(otpChallenges)
        .set({ consumedAt: now })
        .where(
          and(
            eq(otpChallenges.phone, phone),
            isNull(otpChallenges.consumedAt)
          )
        );

      // 4. Insert new challenge
      await tx.insert(otpChallenges).values({
        phone,
        codeHash,
        expiresAt,
        attempts: 0,
        maxAttempts,
        consumedAt: null,
        ipHash,
        createdAt: now,
      });
    });

    // 5. Dispatch SMS side-effect
    try {
      await provider.sendOtp(phone, code);
    } catch (err: unknown) {
      // If SMS fails, mark challenge as consumed so user is not blocked by a ghost OTP
      await db
        .update(otpChallenges)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(otpChallenges.phone, phone),
            eq(otpChallenges.codeHash, codeHash)
          )
        );
      throw err;
    }

    return {
      retryAfter: cooldownSeconds,
      expiresInSeconds: ttlSeconds,
      ...(isNonProd ? { demoCode: code } : {}),
    };
  }

  /**
   * 2. Verifies 6-digit OTP code against PostgreSQL challenge.
   * Atomically consumes challenge, provisions new user with 'motorist' role,
   * creates user wallet, and issues a 256-bit server-side session.
   */
  static async verifyOtp(
    rawPhone: string,
    rawCode: string,
    clientIp: string
  ): Promise<VerifyOtpResult> {
    const phone = normalizeKzPhone(rawPhone);

    if (!rawCode || typeof rawCode !== 'string' || !/^\d{6}$/.test(rawCode.trim())) {
      throw new ValidationError('Код подтверждения должен состоять ровно из 6 цифр');
    }

    const code = rawCode.trim();
    const now = new Date();

    // 1. Fetch active challenge for phone
    const [challenge] = await db
      .select()
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.phone, phone),
          isNull(otpChallenges.consumedAt)
        )
      )
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);

    if (!challenge) {
      throw new UnauthorizedError('Код подтверждения не найден или уже был использован');
    }

    // Check Expiration
    if (now.getTime() > new Date(challenge.expiresAt).getTime()) {
      await db
        .update(otpChallenges)
        .set({ consumedAt: now })
        .where(eq(otpChallenges.id, challenge.id));
      throw new UnauthorizedError('Срок действия кода подтверждения истек. Запросите новый код.');
    }

    // Check Attempt Limit
    if (challenge.attempts >= challenge.maxAttempts) {
      await db
        .update(otpChallenges)
        .set({ consumedAt: now })
        .where(eq(otpChallenges.id, challenge.id));
      throw new UnauthorizedError('Превышено максимальное количество попыток ввода. Запросите новый код.');
    }

    // 2. Verify HMAC-SHA256 Hash
    const isValid = verifyOtpHash(phone, code, challenge.codeHash);

    if (!isValid) {
      const newAttempts = challenge.attempts + 1;
      const isExhausted = newAttempts >= challenge.maxAttempts;

      await db
        .update(otpChallenges)
        .set({
          attempts: newAttempts,
          consumedAt: isExhausted ? now : null,
        })
        .where(eq(otpChallenges.id, challenge.id));

      const remainingAttempts = challenge.maxAttempts - newAttempts;
      if (remainingAttempts <= 0) {
        throw new UnauthorizedError('Неверный код. Превышен лимит попыток. Запросите код заново.');
      }

      throw new UnauthorizedError(`Неверный код подтверждения. Осталось попыток: ${remainingAttempts}`);
    }

    return await db.transaction(async (tx) => {
      // 3. Atomically consume challenge inside transaction
      const [consumed] = await tx
        .update(otpChallenges)
        .set({ consumedAt: now })
        .where(
          and(
            eq(otpChallenges.id, challenge.id),
            isNull(otpChallenges.consumedAt)
          )
        )
        .returning();

      if (!consumed) {
        throw new UnauthorizedError('Код подтверждения не найден или уже был использован');
      }

      // 4. User Provisioning (Find or Insert)
      let [user] = await tx
        .select()
        .from(users)
        .where(eq(users.phone, phone))
        .for('update');

      if (!user) {
        // Create new motorist user (ZERO ROLE ESCALATION: always 'motorist')
        const [newUser] = await tx
          .insert(users)
          .values({
            phone,
            roles: ['motorist'],
            isBlocked: false,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        user = newUser;

        // Ensure wallet for new user
        await tx.insert(wallets).values({
          userId: user.id,
          balanceTiyn: 0,
          frozenTiyn: 0,
          updatedAt: now,
        });
      } else {
        if (user.isBlocked) {
          throw new ForbiddenError('Учетная запись пользователя заблокирована');
        }

        // Ensure wallet exists for existing user if missing
        const [existingWallet] = await tx
          .select({ id: wallets.id })
          .from(wallets)
          .where(eq(wallets.userId, user.id));

        if (!existingWallet) {
          await tx.insert(wallets).values({
            userId: user.id,
            balanceTiyn: 0,
            frozenTiyn: 0,
            updatedAt: now,
          });
        }
      }

      // Check Provider ID if user has provider role
      let providerId: string | undefined;
      if (user.roles.includes('provider')) {
        const [provider] = await tx
          .select({ id: providers.id })
          .from(providers)
          .where(eq(providers.userId, user.id));
        if (provider) {
          providerId = provider.id;
        }
      }

      // 5. Create Server-Side Session in database inside transaction
      const sessionResult = await createSession(user.id, env.AUTH_SESSION_TTL_SECONDS, tx);

      return {
        sessionToken: sessionResult.sessionToken,
        expiresAt: sessionResult.expiresAt,
        user: {
          id: user.id,
          phone: user.phone,
          roles: user.roles,
          isBlocked: user.isBlocked,
          providerId,
        },
      };
    });
  }

  /**
   * 3. Resolves current authenticated session from session token
   */
  static async resolveSession(sessionToken: string): Promise<AuthUser | null> {
    return await validateSessionToken(sessionToken);
  }

  /**
   * 4. Logs out and revokes active session
   */
  static async logout(sessionToken: string): Promise<void> {
    await revokeSession(sessionToken);
  }
}
