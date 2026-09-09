# CARFIX — ARCHITECTURAL DECISION RECORDS (ADR)

**Version:** 2.0 (Canonical Consistency Pass)  
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
| **ADR-005** | Three Canonical MVP Launch Categories | Accepted | 2026-09-09 |
| **ADR-006** | Three Pricing Modes in Integer Tiyn Minor Units | Accepted | 2026-09-09 |
| **ADR-007** | 12-State Canonical Order State Machine & Audit | Accepted | 2026-09-09 |
| **ADR-008** | Server-Sent Events (SSE) with REST Reconnect | Accepted | 2026-09-09 |
| **ADR-009** | Direct Payment (Kaspi QR/Cash) for MVP | Accepted | 2026-09-09 |
| **ADR-010** | Telegram Provider Notifications & Action Channel | Accepted | 2026-09-09 |
| **ADR-011** | Multi-Role User Model (`roles: varchar[]`) | Accepted | 2026-09-09 |
| **ADR-012** | Provider Capability-Based Matching Model | Accepted | 2026-09-09 |
| **ADR-013** | Database-Driven Timers & Background Execution | Accepted | 2026-09-09 |
| **ADR-014** | Canonical Authorization & Anti-IDOR Ownership | Accepted | 2026-09-09 |
| **ADR-015** | Idempotency & Concurrency Locking Strategy | Accepted | 2026-09-09 |

---

## ADR-001: Single Next.js Application (Modular Monolith)

### Context
We evaluated whether to build a monorepo with multiple apps (Fastify API + Next.js Web) or a single unified Next.js application.

### Decision
Adopt a **single Next.js application** (App Router, API Route Handlers, Domain Layer, PWA).

### Rationale
A solo developer building an MVP suffers high cognitive load from multi-app monorepos (redundant boilerplate, build tooling overhead, port management). Next.js API Route Handlers with a clean server-side domain service layer provide complete type-safety, zero build overhead, and seamless full-stack deployment.

### Consequences
- Backend and frontend reside in one codebase (`src/app/api`, `src/server`, `src/app`).
- Reversal Condition: If API traffic demands independent scaling or separate team ownership, extract `src/server` into Fastify.

---

## ADR-002: PostgreSQL 16 + PostGIS for Spatial Matching

### Context
Geospatial matching of drivers and technicians is the core technical capability.

### Decision
Use PostgreSQL 16 with the **PostGIS** extension (`geography(Point, 4326)`).

### Rationale
PostGIS provides native spherical distance calculations (`ST_DWithin`, `ST_Distance`) with high-performance spatial GIST indexing. This eliminates custom trigonometry and scales effortlessly for city-wide matching in Astana.

---

## ADR-003: Drizzle ORM for Database Access & Migrations

### Context
We need a type-safe TypeScript ORM that natively supports PostGIS spatial queries and SQL transactions.

### Decision
Use **Drizzle ORM** (`drizzle-orm`, `drizzle-kit`).

### Rationale
Drizzle generates lightweight SQL queries without heavy runtime overhead, offers full TypeScript inference from schema definitions, and allows raw SQL escape hatches for complex PostGIS spatial queries.

---

## ADR-004: Phone OTP + JWT Authentication

### Context
Automotive emergency users in Kazakhstan expect phone-number-based login without passwords.

### Decision
Implement phone number + 6-digit SMS OTP authentication (mock provider in dev, SMS.kz in production) issuing short-lived access JWTs (15 min) and long-lived refresh JWTs (30 days) stored in `httpOnly` secure cookies.

---

## ADR-005: Three Canonical MVP Launch Categories

### Context
Attempting to cover all automotive services (bodywork, tire fitting, towing, engine overhaul) dilutes supply liquidity in Astana.

### Decision
Strictly limit MVP to **3 emergency categories**:
1. `electrical_starting`
2. `battery_jumpstart`
3. `mobile_mechanic`

### Rationale
These categories target acute, high-urgency pain points where mobile technicians have immediate availability and high willingness to travel.

---

## ADR-006: Three Pricing Modes in Integer Tiyn Minor Units

### Context
Automotive repair costs cannot always be determined before physical inspection. Floating-point numbers create rounding errors.

### Decision
Store all prices as integer minor units (tiyn: 1 KZT = 100 tiyn). Support 3 distinct pricing modes:
1. `fixed` (`amount_tiyn`)
2. `diagnostic_fee` (`amount_tiyn`)
3. `estimate_range` (`min_amount_tiyn`, `max_amount_tiyn`)

---

## ADR-007: 12-State Canonical Order State Machine & Audit

### Context
Marketplace transactions require unambiguous status lifecycle tracking.

### Decision
Implement a single 12-state state machine:
`DRAFT` → `PUBLISHED` → `OFFERS_RECEIVED` → `PROVIDER_SELECTED` → `EN_ROUTE` → `ARRIVED` → `IN_PROGRESS` → `PENDING_COMPLETION` → `COMPLETED` / `CANCELLED` / `EXPIRED` / `DISPUTED`.
Every transition records an immutable row in `order_status_history`.

---

## ADR-008: Server-Sent Events (SSE) with REST Reconnect

### Context
The customer needs live updates when provider offers arrive.

### Decision
Use **Server-Sent Events (SSE)**. On connection loss, the client automatically reconnects and triggers a standard REST `GET` request to synchronize the latest state.

---

## ADR-009: Direct Payment (Kaspi QR/Cash) for MVP

### Context
Integrating in-app escrow payments adds regulatory, banking, and refund complexity before proving transaction demand.

### Decision
Customers pay providers directly (Kaspi QR or cash). The platform does not hold customer funds in MVP.

---

## ADR-010: Telegram Provider Notifications & Action Channel

### Context
Technicians in Astana do not keep web browser tabs active while driving or working in workshops.

### Decision
Integrate a dedicated Telegram Bot (@CarFixPartnerBot) as the primary lead notification and quick-action channel for providers.
- Accounts are linked via secure one-time pairing codes.
- Providers receive instant alerts with inline bidding buttons.
- Core database remains the single source of truth; webhook callbacks are executed with idempotency.

---

## ADR-011: Multi-Role User Model (`roles: varchar[]`)

### Context
A user may be a car owner and also a mechanic, or an administrator.

### Decision
Model roles as an array `roles: UserRole[]` (e.g. `['motorist']`, `['motorist', 'provider']`, `['admin']`). The admin role can only be assigned through trusted operational seed or existing admin grants.

---

## ADR-012: Provider Capability-Based Matching Model

### Context
Matching requests solely by provider type creates rigid silos.

### Decision
Decouple `ProviderProfile` from `ProviderCapabilities` (`BATTERY`, `AUTO_ELECTRIC`, `DIAGNOSTICS`, `MECHANICAL_MINOR`) and `ServiceMode` (`MOBILE`, `AT_LOCATION`). Matching evaluates `ServiceRequest.required_capabilities` against `ProviderCapabilities`.

---

## ADR-013: Database-Driven Timers & Background Execution

### Context
Node.js `setTimeout` in memory is lost on server restart.

### Decision
Persist timer metadata directly in PostgreSQL:
- `service_requests.expires_at`
- `service_requests.next_expansion_at`
- `provider_availability.auto_offline_at`
A lightweight in-process interval worker (every 30s) executes pending transitions without requiring Redis or external queue infrastructure in MVP.

---

## ADR-014: Canonical Authorization & Anti-IDOR Ownership

### Context
Predictable UUIDs or direct ID parameters must not allow unauthorized access to another user's requests or orders.

### Decision
Enforce strict resource ownership checks in domain services for every endpoint:
- Customers can only read/mutate requests and orders where `customer_id = user.id`.
- Providers can only access requests matched to their capabilities and orders where `provider_id = provider.id`.
- Contact details (phone, exact coordinates) are masked until provider selection is confirmed.

---

## ADR-015: Idempotency & Concurrency Locking Strategy

### Context
Simultaneous offer acceptance or duplicate button taps can create race conditions and duplicate orders.

### Decision
1. **Offer Uniqueness:** `UNIQUE(request_id, provider_id)` database constraint.
2. **Atomic Offer Acceptance:** `SELECT FOR UPDATE` transaction on the `service_requests` row. Exactly one offer selection succeeds; concurrent requests receive a `409 Conflict`.
3. **Telegram Callbacks:** Track processed `callback_query_id` to prevent duplicate action processing.
