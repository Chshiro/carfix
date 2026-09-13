# CarFix — Production Authentication Implementation Plan

## 1. Executive Summary & Audit Findings

### 1.1 Facts Established from Codebase Inspection
- **User Provisioning:** `users` table uses `uuid` PK, unique `phone` (`varchar(20)`), `roles` (`text[]`), and `is_blocked` (`boolean`).
- **Financial Architecture:** `wallets` table is linked 1:1 to `users.id` (`user_id` unique FK with cascade). `PaymentService` automatically creates wallets on-demand or during financial events. Creating a wallet atomically upon user registration ensures financial integrity across all order/escrow workflows.
- **Role Model:** Canonical roles are `['motorist']`, `['provider']`, `['admin']`. Role `provider` requires a matching row in `providers` table (`user_id = users.id`). Public authentication MUST ONLY provision `['motorist']`.
- **Legacy Auth:** `src/server/auth.ts` used stateless Bearer JWT with an in-memory 30s user cache. Demo token endpoint was `/api/auth/demo-token`. OTP in `CustomerService` used an in-memory Map and 4 digits without cryptographic hashing.
- **Target Architecture:** Production-ready authentication based on **Server-Side Session Cookies** (`carfix_session`, opaque token hash in DB) + **6-digit HMAC-SHA256 hashed OTP** in PostgreSQL (`otp_challenges`) + **Atomic Multi-Level Rate Limiting** + **Preserved Bearer Token Compatibility** for integration tests and API clients.

---

## 2. Final Architecture & Component Boundaries

```
[ Client / Browser (AuthModal / Next.js) ]
                │
                ├─ 1. POST /api/auth/request-otp { phone: "+7 (701) 555-12-34" }
                │    ↓
                │  [ Client IP Resolution (client-ip.ts) ]
                │    ↓
                │  [ Phone Normalization & KZ Validation (phone.ts) ]
                │    ↓
                │  [ Atomic Rate Limiting & Cooldown Check (PostgreSQL) ]
                │    ↓
                │  [ Crypto-Secure 6-digit OTP (otp.ts) ]
                │    ↓
                │  [ HMAC-SHA256 Hash with OTP_HMAC_SECRET ]
                │    ↓
                │  [ Save to otp_challenges & Invalidate Previous Active ]
                │    ↓
                │  [ ISmsProvider Dispatch (Mock / KazSmsProvider) ]
                │    ↓
                │  [ Return { status: "ok", data: { retryAfter: 60 } } ]
                │
                ├─ 2. POST /api/auth/verify-otp { phone: "+77015551234", code: "381924" }
                │    ↓
                │  [ Transaction with SELECT FOR UPDATE on otp_challenges ]
                │    ↓
                │  [ Check Expiry (5m), Consumed, Attempts (<3) ]
                │    ↓
                │  [ Timing-Safe HMAC Comparison ]
                │    ↓ (Failure: attempts++, if attempts>=3 consume)
                │    ↓ (Success: consume challenge)
                │    ↓
                │  [ Find or Create User (roles=['motorist']) & Ensure Wallet ]
                │    ↓
                │  [ Create 256-bit Session Token -> Save SHA-256 Hash to sessions ]
                │    ↓
                │  [ Set-Cookie: carfix_session=...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000 ]
                │    ↓
                │  [ Return { status: "ok", data: { user } } ]
                │
                ├─ 3. GET /api/auth/me
                │    ↓
                │  [ Read Cookie -> Hash Token -> Lookup Session in sessions ]
                │    ↓
                │  [ Check Session Revocation & Expiry (30d) + Check User isBlocked ]
                │    ↓
                │  [ Throttled Update last_used_at (> 5 min) ]
                │    ↓
                │  [ Return { status: "ok", data: { user } } ]
                │
                └─ 4. POST /api/auth/logout
                     ↓
                   [ Set session.revoked_at = NOW() in DB & Clear Cookie ]
```

---

## 3. Database Schema (`src/db/schema/auth.ts`)

### 3.1 `otp_challenges` Table
- `id`: `uuid` (Primary Key, defaultRandom())
- `phone`: `varchar(20)` (E.164, `+77XXXXXXXXX`, not null)
- `code_hash`: `text` (HMAC-SHA256, not null)
- `expires_at`: `timestamp with time zone` (not null, default now + 5 min)
- `attempts`: `integer` (default 0, not null)
- `max_attempts`: `integer` (default 3, not null)
- `consumed_at`: `timestamp with time zone` (null until consumed)
- `ip_hash`: `varchar(64)` (SHA-256 of client IP, not null)
- `created_at`: `timestamp with time zone` (default now, not null)

**Indexes:**
- `idx_otp_challenges_phone_created`: `(phone, created_at DESC)`
- `idx_otp_challenges_expires`: `(expires_at)`
- `idx_otp_challenges_ip_created`: `(ip_hash, created_at DESC)`

### 3.2 `sessions` Table
- `id`: `uuid` (Primary Key, defaultRandom())
- `user_id`: `uuid` (References `users.id` with onDelete: `cascade`, not null)
- `session_token_hash`: `varchar(64)` (Unique, SHA-256, not null)
- `expires_at`: `timestamp with time zone` (not null, default now + 30 days)
- `revoked_at`: `timestamp with time zone` (null until logout)
- `last_used_at`: `timestamp with time zone` (default now, not null)
- `created_at`: `timestamp with time zone` (default now, not null)

**Indexes:**
- `uq_sessions_token_hash`: Unique `(session_token_hash)`
- `idx_sessions_user_id`: `(user_id)`
- `idx_sessions_expires`: `(expires_at)`

---

## 4. File-by-File Implementation Plan

| File Path | Role | Description |
|---|---|---|
| `src/server/errors.ts` | Error Classes | Add `RateLimitError` (HTTP 429) and standard auth error codes. |
| `src/server/auth/phone.ts` | Phone Validation | Normalization to `+77XXXXXXXXX`, KZ mobile prefix validation, phone masking. |
| `src/server/auth/otp.ts` | OTP Mathematics | 6-digit crypto-secure generator, HMAC-SHA256 hasher, timing-safe verification. |
| `src/server/auth/client-ip.ts` | IP Resolution | Extraction and SHA-256 hashing of client IP with proxy safety. |
| `src/server/auth/session.ts` | Session Lifecycle | 256-bit token generator, DB session creation, validation, throttled `last_used_at`, revocation. |
| `src/server/auth/csrf.ts` | CSRF Protection | Origin / Referer header validation for state-changing HTTP requests. |
| `src/server/services/sms.service.ts` | SMS Gateway | `ISmsProvider`, `MockSmsProvider` (production-prohibited), `KazSmsProvider` with timeout & safety. |
| `src/server/services/auth.service.ts` | Orchestration | `requestOtp`, `verifyOtp`, `logout`, `resolveSession`, atomic rate-limiting, user & wallet provisioning. |
| `src/server/auth.ts` | Auth Boundary | Hybrid resolution: Cookie session primary + Bearer JWT compatibility. Zero stale cache. |
| `src/db/schema/auth.ts` | DB Schema | Drizzle definitions for `otp_challenges` and `sessions`. |
| `src/db/schema/index.ts` | Schema Export | Re-export auth tables and relations. |
| `src/lib/env.ts` | Env Config | Add `OTP_HMAC_SECRET`, `AUTH_OTP_COOLDOWN_SECONDS`, etc. with production validation. |
| `src/app/api/auth/request-otp/route.ts` | API Route | Handles OTP challenge creation with rate limiting. |
| `src/app/api/auth/verify-otp/route.ts` | API Route | Verifies OTP and sets `carfix_session` HttpOnly cookie. |
| `src/app/api/auth/me/route.ts` | API Route | Returns authenticated user & provider profile. |
| `src/app/api/auth/logout/route.ts` | API Route | Revokes session and clears cookie. |
| `src/app/api/auth/demo-token/route.ts` | Demo API | Restricted strictly to non-production (`NODE_ENV !== 'production' && DEMO_MODE === 'true'`). |
| `src/components/ui/AuthModal.tsx` | Frontend Component | 8-state FSM, mask input, 6 OTP digit inputs, paste support, 0:59 cooldown timer. |
| `src/app/page.tsx` | Frontend Main | Session bootstrap via `/api/auth/me`, profile header, logout. |
| `tests/auth-production-flow.test.ts` | Automated Tests | 30+ tests covering phone, OTP, rate limits, concurrency, sessions, CSRF, security. |

---

## 5. Security & Verification Plan

1. **Enumeration Protection:** `requestOtp` always returns `{ status: "ok", data: { retryAfter: 60 } }` regardless of whether the phone exists in `users`.
2. **Brute-Force & Race-Condition Testing:** 10 concurrent requests to `verifyOtp` and `requestOtp` must maintain atomicity without double-issuance or bypass.
3. **No Privilege Escalation:** Role `admin` or `provider` cannot be requested; only `motorist` is initialized.
4. **Mock SMS Safety:** In `production`, `MockSmsProvider` throws a configuration error on startup.
5. **Full Regression:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
