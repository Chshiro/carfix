# CARFIX — ARCHITECTURAL DECISION RECORDS (ADR)

**Version:** 2.1 (Pre-Implementation P0 Corrections)  
**Date:** 2026-09-09  
**Status:** Approved & Frozen for Implementation

---

## ADR Index

| ADR # | Title | Status | Date |
|---|---|---|---|
| **ADR-001** | Single Next.js Application (Modular Monolith) | Accepted | 2026-09-09 |
| **ADR-002** | PostgreSQL 16 + PostGIS for Spatial Matching | Accepted | 2026-09-09 |
| **ADR-003** | Drizzle ORM for Database Access & Migrations | Accepted | 2026-09-09 |
| **ADR-004** | Phone OTP + JWT Authentication | Accepted | 2026-09-09 |
| **ADR-005** | Three Canonical MVP Launch Categories & Safety Exclusions | Accepted | 2026-09-09 |
| **ADR-006** | Three Pricing Modes in Integer Tiyn Minor Units | Accepted | 2026-09-09 |
| **ADR-007** | 12-State Canonical Order State Machine & Bidirectional Reviews | Accepted | 2026-09-09 |
| **ADR-008** | Server-Sent Events (SSE) with REST Reconnect | Accepted | 2026-09-09 |
| **ADR-009** | Direct Payment (Kaspi QR/Cash) for MVP | Accepted | 2026-09-09 |
| **ADR-010** | Telegram Provider Notifications & Action Channel | Accepted | 2026-09-09 |
| **ADR-011** | Multi-Role User Model (`roles: varchar[]`) | Accepted | 2026-09-09 |
| **ADR-012** | Provider Capability-Based Matching (OR Semantics) | Accepted | 2026-09-09 |
| **ADR-013** | Database-Driven Timers & Background Execution | Accepted | 2026-09-09 |
| **ADR-014** | Canonical Authorization & Anti-IDOR Ownership | Accepted | 2026-09-09 |
| **ADR-015** | 11-Step Atomic Offer Selection & Idempotency Strategy | Accepted | 2026-09-09 |

---

## ADR-001: Single Next.js Application (Modular Monolith)
Adopt a **single Next.js application** (App Router, API Route Handlers, Domain Layer, PWA). Eliminates monorepo overhead and Fastify/Next.js duality for a solo developer.

---

## ADR-002: PostgreSQL 16 + PostGIS for Spatial Matching
Use PostgreSQL 16 with the **PostGIS** extension (`geography(Point, 4326)`). PostGIS provides native spherical distance calculations (`ST_DWithin`, `ST_Distance`) with high-performance GIST spatial indexing.

---

## ADR-003: Drizzle ORM for Database Access & Migrations
Use **Drizzle ORM** (`drizzle-orm`, `drizzle-kit`) for schema-first type safety and raw PostGIS spatial queries.

---

## ADR-004: Phone OTP + JWT Authentication
Implement phone number + 6-digit SMS OTP authentication issuing short-lived access JWTs (15 min) and long-lived refresh JWTs (30 days) stored in `httpOnly` secure cookies.

---

## ADR-005: Three Canonical MVP Launch Categories & Safety Exclusions

### Context
Attempting to cover all automotive services dilutes supply liquidity. Certain repair categories carry critical safety liability.

### Decision
Strictly limit MVP to **3 emergency categories**:
1. `electrical_starting`
2. `battery_jumpstart`
3. `mobile_mechanic` (Strictly non-safety-critical: drive belts, hoses, spark plugs, fluid top-up).

**Explicit Safety Exclusions:** Brakes, steering, suspension, airbags/SRS, and critical fuel-system repairs are strictly EXCLUDED from MVP.

---

## ADR-006: Three Pricing Modes in Integer Tiyn Minor Units
Store all prices as integer minor units (tiyn: 1 KZT = 100 tiyn). Support 3 distinct pricing modes: `fixed`, `diagnostic_fee`, `estimate_range`.

---

## ADR-007: 12-State Canonical Order State Machine & Bidirectional Reviews

### Context
Marketplace transactions require unambiguous status lifecycle tracking and bidirectional trust.

### Decision
Implement a single 12-state state machine:
`DRAFT` → `PUBLISHED` → `OFFERS_RECEIVED` → `PROVIDER_SELECTED` → `EN_ROUTE` → `ARRIVED` → `IN_PROGRESS` → `PENDING_COMPLETION` → `COMPLETED` / `CANCELLED` / `EXPIRED` / `DISPUTED`.
Every transition records an immutable row in `order_status_history`.

**Bidirectional Reviews:** After completion, both customer and provider can submit 1 review with database constraints `UNIQUE(order_id, from_user_id)`, `CHECK(from_user_id <> to_user_id)`, and `CHECK(rating >= 1 AND rating <= 5)`.

---

## ADR-008: Server-Sent Events (SSE) with REST Reconnect
Use **Server-Sent Events (SSE)** for real-time offer streaming. On connection loss, the client automatically reconnects and triggers a standard REST `GET` request to synchronize full state.

---

## ADR-009: Direct Payment (Kaspi QR/Cash) for MVP
Customers pay providers directly (Kaspi QR or cash). The platform does not hold customer funds in MVP.

---

## ADR-010: Telegram Provider Notifications & Action Channel
Integrate a dedicated Telegram Bot (@CarFixPartnerBot) as the primary lead notification and quick-action channel for providers with secure token linking and idempotent callback execution.

---

## ADR-011: Multi-Role User Model (`roles: varchar[]`)
Model roles as an array `roles: UserRole[]` (e.g. `['motorist']`, `['motorist', 'provider']`, `['admin']`). The admin role can only be assigned through trusted operational seed or existing admin grants.

---

## ADR-012: Provider Capability-Based Matching (OR Semantics)

### Context
Matching requests solely by provider type creates rigid silos. Matching semantics must be unambiguous.

### Decision
Decouple `ProviderProfile` from `ProviderCapabilities` (`BATTERY`, `AUTO_ELECTRIC`, `DIAGNOSTICS`, `MECHANICAL_MINOR`).

**Matching Semantics:** `ServiceRequest.required_capabilities` represents **alternative acceptable capabilities (OR semantics)**. A provider matches if they possess *at least one* matching capability (`pc.capability = ANY(sr.required_capabilities)`). It does not require a provider to possess all requested capabilities.

---

## ADR-013: Database-Driven Timers & Background Execution
Persist timer metadata directly in PostgreSQL (`expires_at`, `next_expansion_at`, `auto_offline_at`). A lightweight in-process interval worker (every 30s) executes pending transitions without requiring Redis in MVP.

---

## ADR-014: Canonical Authorization & Anti-IDOR Ownership
Enforce strict resource ownership checks in domain services for every endpoint. Contact details (phone, exact coordinates) are masked until provider selection is confirmed.

---

## ADR-015: 11-Step Atomic Offer Selection & Idempotency Strategy

### Context
Simultaneous offer acceptance or duplicate button taps can create race conditions and duplicate orders.

### Decision
Offer acceptance must execute as an **11-step atomic database transaction**:
1. `SELECT service_request FOR UPDATE` (lock row)
2. Verify request status allows selection (`PUBLISHED` or `OFFERS_RECEIVED`)
3. Verify offer belongs to this request (`offer.request_id = service_request.id`)
4. Verify offer is still selectable (`offer.status = 'SUBMITTED'`)
5. Verify provider remains eligible (provider active, not blocked)
6. Create `Order` record (`status = 'PROVIDER_SELECTED'`)
7. Mark selected offer as `ACCEPTED`
8. Mark all other submitted offers for this request as `REJECTED`
9. Update `service_request` status to `PROVIDER_SELECTED`
10. Insert initial `order_status_history` record
11. `COMMIT`

*Idempotency:* Offer uniqueness constraint `UNIQUE(request_id, provider_id)` and processed callback tracking for Telegram prevent duplicate mutations.

---

## ADR-016: Production Phone OTP & Server-Side Session Hardening

### Context
Stateless JWT stored in browser `localStorage` exposes auth tokens to XSS and makes session invalidation difficult. Plaintext OTPs or client-controlled role parameters create critical vulnerabilities.

### Decision
1. **Server-Side Sessions:** Store 256-bit random session tokens hashed with SHA-256 in the PostgreSQL `sessions` table. Issue `carfix_session` as an `HttpOnly`, `Secure` (in prod), `SameSite=Lax`, 30-day cookie.
2. **HMAC-SHA256 OTP Hashing:** 6-digit crypto-random OTPs (`000000`–`999999`) are hashed with a dedicated `OTP_HMAC_SECRET` into `otp_challenges`. Plaintext OTP is never stored in DB or logged in production.
3. **Strict Rate Limiting:** Enforce a 60s phone cooldown, 10 req/hr IP limit, max 3 verification attempts per challenge (lock/consume on 3rd failure), and automatic invalidation of older active OTPs.
4. **Zero Privilege Escalation:** Public OTP login registers users strictly with `roles = ['motorist']`. The `provider` role is derived server-side from verified `providers` profiles, and `admin` can never be self-registered.
5. **Pluggable SMS Gateway:** Abstract SMS delivery via `ISmsProvider` with a `MockSmsProvider` (strictly blocked in production) and `KazSmsProvider` for live SMS delivery.

