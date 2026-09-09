# CARFIX — CANONICAL SYSTEM ARCHITECTURE

**Version:** 2.0 (Canonical Consistency Pass)  
**Date:** 2026-09-09  
**Status:** Canonical & Implementation-Ready  
**Market:** Astana, Kazakhstan

---

## 1. Architectural Philosophy

CarFix is built following the **"Boring Technology & Modular Monolith"** principle:
- **Zero Premature Distributed Systems:** A single, well-structured Next.js application (App Router + Domain Layer + Drizzle ORM + PostgreSQL 16/PostGIS).
- **Zero Microservices / No Kafka / No RabbitMQ / No Redis in MVP:** Database-backed state, transactions, and lightweight in-process scheduled tasks provide 100% reliability with minimal operational overhead.
- **Deterministic Core:** Matching, pricing, state transitions, and authorization are strictly deterministic in TypeScript code. LLMs / AI are not part of the MVP runtime loop.

---

## 2. High-Level System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CLIENT TIER                               │
│  ┌───────────────────────────────┐   ┌───────────────────────────────┐ │
│  │   Customer PWA (Next.js)      │   │   Provider PWA (Next.js)      │ │
│  │   - Mobile-First Web Shell    │   │   - Active Dashboard          │ │
│  │   - 2-Step Request Wizard     │   │   - Bid Submission & Orders   │ │
│  │   - Real-time Offer Feed(SSE) │   │   - Availability GPS Toggle   │ │
│  └───────────────┬───────────────┘   └───────────────┬───────────────┘ │
│                  │                                   │                 │
│                  │        ┌──────────────────────────┘                 │
│                  │        │  ┌───────────────────────────────────────┐ │
│                  │        │  │ Telegram Bot (@CarFixPartnerBot)      │ │
│                  │        │  │ - Instant Lead Alerts via Webhook     │ │
│                  │        │  │ - 1-Tap Inline Keyboard Bidding       │ │
│                  └────┬───┴──┼───────────────────────────────────────┘ │
└───────────────────────┼──────┼─────────────────────────────────────────┘
                        │ HTTPS│ (REST / SSE / Webhook)
                        ▼      ▼
┌────────────────────────────────────────────────────────────────────────┐
│               APPLICATION CORE (Single Next.js App)                    │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Route Handlers (`src/app/api/...`) & Middleware                  │  │
│  │ - JWT Auth (jose) & Multi-Role Authorization                     │  │
│  │ - Request Validation (Zod) & Standard Error Contract             │  │
│  │ - Rate Limiting & Resource Ownership Guards (Anti-IDOR)          │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │                                  │
│  ┌──────────────────────────────────▼───────────────────────────────┐  │
│  │ Domain Service Layer (`src/server/services/...`)                 │  │
│  │ - AuthService & OTP Verification                                 │  │
│  │ - RequestService & Deterministic PostGIS Matching                │  │
│  │ - OfferService (Fixed / Diagnostic Fee / Range in Tiyn)          │  │
│  │ - OrderService (12-State Machine + `SELECT FOR UPDATE` Lock)      │  │
│  │ - ReviewService (1–5 Star Rating & Aggregate Recalculation)      │  │
│  │ - TelegramBotService (Webhook handler & alert dispatcher)        │  │
│  │ - AdminService (Provider verification & dispute resolution)      │  │
│  │ - BackgroundTimerWorker (DB-driven expiration & auto-offline)    │  │
│  └──────────────────────────────────┬───────────────────────────────┘  │
│                                     │ Drizzle ORM                      │
│                                     ▼                                  │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           PERSISTENCE TIER                             │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ PostgreSQL 16 + PostGIS Extension                                │  │
│  │ - Single source of truth for location: geography(Point, 4326)    │  │
│  │ - Spatial indexing (GIST) for ST_DWithin radius queries          │  │
│  │ - Relational integrity: Foreign Keys, Check Constraints          │  │
│  │ - Concurrency: SELECT FOR UPDATE on offer acceptance             │  │
│  │ - Database-driven timers: expiresAt, nextExpansionAt             │  │
│  │ - Complete audit trail: order_status_history, admin_audit_logs   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ S3-Compatible Object Storage (Cloudflare R2 / AWS S3)            │  │
│  │ - Request media (max 3 images) & Provider verification docs      │  │
│  │ - Pre-signed secure upload URLs, UUID storage keys               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Canonical Domain Model

### 3.1 User & Roles
- Users are identified by verified phone number.
- `roles` is an array: `varchar[]` (e.g. `['motorist']`, `['motorist', 'provider']`, `['admin']`).
- Admin role can only be assigned by existing admins or database seed.

### 3.2 Provider & Capabilities
A provider is decoupled into:
- `ProviderProfile`: business name, provider type (`STO`, `INDEPENDENT_MASTER`, `MOBILE_MASTER`), verification level (`LEVEL_1_VERIFIED_SERVICE`, `LEVEL_2_VERIFIED_MASTER`, `LEVEL_3_NEW_PROVIDER`), description.
- `ProviderCapability`: list of verified capabilities (`BATTERY`, `AUTO_ELECTRIC`, `DIAGNOSTICS`, `MECHANICAL_MINOR`).
- `ProviderAvailability`: `is_online` flag, `location geography(Point, 4326)`, `radius_km` (default 10), `location_updated_at`, `auto_offline_at`.
- `ServiceMode`: supported modes (`MOBILE`, `AT_LOCATION`).

### 3.3 Vehicles
- Vehicles are stored in a user's garage (`make`, `model`, `year`, `license_plate`).
- **Vehicle is optional on ServiceRequest:** `vehicle_id` is nullable. A motorist in an emergency can create a request with just category and location.

### 3.4 Service Requests & Spatial Matching
- Categories for MVP (strictly 3): `electrical_starting`, `battery_jumpstart`, `mobile_mechanic`.
- Location is stored as `location geography(Point, 4326)` with a GIST index.
- Spatial matching is a deterministic SQL query:
  ```sql
  SELECT p.id, p.user_id, ST_Distance(pa.location, sr.location) AS distance_meters
  FROM providers p
  JOIN provider_availability pa ON pa.provider_id = p.id
  JOIN provider_capabilities pc ON pc.provider_id = p.id
  WHERE pa.is_online = TRUE
    AND pa.location_updated_at >= NOW() - INTERVAL '4 hours'
    AND pc.capability = ANY(sr.required_capabilities)
    AND ST_DWithin(pa.location, sr.location, sr.current_radius_km * 1000);
  ```

### 3.5 Money & Pricing Model
- All monetary values are stored as **integer minor units (tiyn)**. 1 KZT = 100 tiyn (e.g. 5 000 ₸ = `500000`).
- 3 pricing modes:
  1. `fixed`: `amount_tiyn > 0`
  2. `diagnostic_fee`: `amount_tiyn > 0` (final repair price agreed after on-site diagnosis)
  3. `estimate_range`: `min_amount_tiyn > 0` and `max_amount_tiyn >= min_amount_tiyn`

---

## 4. Canonical Order State Machine (12 States)

The marketplace transaction follows a strict 12-state finite state machine with full auditing in `order_status_history`.

```
Status Transition Matrix:
┌─────────────────────┬──────────────────────┬────────────────────┬──────────────────────────────────────┐
│ From Status         │ To Status            │ Allowed Actor      │ Server-Side Guard                    │
├─────────────────────┼──────────────────────┼────────────────────┼──────────────────────────────────────┤
│ DRAFT               │ PUBLISHED            │ Customer           │ Valid category & location provided   │
│ DRAFT               │ CANCELLED            │ Customer           │ -                                    │
│ PUBLISHED           │ OFFERS_RECEIVED      │ System             │ First offer submitted by provider    │
│ PUBLISHED           │ EXPIRED              │ System / Worker    │ expires_at reached                   │
│ PUBLISHED           │ CANCELLED            │ Customer           │ No offers accepted yet               │
│ OFFERS_RECEIVED     │ PROVIDER_SELECTED    │ Customer           │ Atomic transaction (SELECT FOR UPDATE│
│ OFFERS_RECEIVED     │ EXPIRED              │ System / Worker    │ expires_at reached                   │
│ OFFERS_RECEIVED     │ CANCELLED            │ Customer           │ -                                    │
│ PROVIDER_SELECTED   │ EN_ROUTE             │ Selected Provider  │ Provider started driving             │
│ PROVIDER_SELECTED   │ CANCELLED            │ Customer/Provider  │ Cancellation reason recorded         │
│ EN_ROUTE            │ ARRIVED              │ Selected Provider  │ Provider arrived at location         │
│ EN_ROUTE            │ CANCELLED            │ Customer/Provider  │ Requires cancellation note           │
│ ARRIVED             │ IN_PROGRESS          │ Selected Provider  │ Diagnostic / repair started          │
│ ARRIVED             │ CANCELLED            │ Customer/Provider  │ -                                    │
│ IN_PROGRESS         │ PENDING_COMPLETION   │ Selected Provider  │ Final price provided (if diagnostic) │
│ PENDING_COMPLETION  │ COMPLETED            │ Customer           │ Customer confirms job done           │
│ PENDING_COMPLETION  │ DISPUTED             │ Customer           │ Price / quality disagreement opened  │
│ DISPUTED            │ COMPLETED            │ Admin              │ Admin resolves dispute in favor of P │
│ DISPUTED            │ CANCELLED            │ Admin              │ Admin cancels order after dispute    │
└─────────────────────┴──────────────────────┴────────────────────┴──────────────────────────────────────┘
Terminal States: COMPLETED, CANCELLED, EXPIRED.
```

---

## 5. Security & Authorization (Anti-IDOR Matrix)

| Resource | Operation | Allowed Roles | Ownership Rule |
|---|---|---|---|
| `ServiceRequest` | Create | Motorist | Authenticated user |
| `ServiceRequest` | View Details | Motorist, Matched Provider, Admin | Owner (`customer_id = user.id`) OR Matched Provider OR Admin |
| `ServiceRequest` | Cancel | Motorist, Admin | Owner (`customer_id = user.id`) |
| `ProviderOffer` | Create | Provider | Eligible matched provider only |
| `ProviderOffer` | List | Motorist, Admin | Request owner (`request.customer_id = user.id`) |
| `Order` | Select Offer | Motorist | Request owner only (atomic lock) |
| `Order` | View Order | Motorist, Selected Provider, Admin | `order.customer_id = user.id` OR `order.provider_id = provider.id` |
| `Order` | Transition Status | Selected Provider, Motorist, Admin | Status matrix rule |
| `Review` | Create | Motorist | `order.customer_id = user.id` AND `order.status = 'COMPLETED'` |
| `Admin Queue` | Moderate | Admin | `user.roles` contains `'admin'` |

---

## 6. Standard API Error Contract

All API route handlers return a uniform JSON error structure:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested service request does not exist or has expired.",
    "details": {}
  }
}
```

### Standard Status Codes:
- `400 Bad Request` — Invalid input, schema validation failure (code: `VALIDATION_ERROR`).
- `401 Unauthorized` — Missing or expired JWT token (code: `UNAUTHORIZED`).
- `403 Forbidden` — IDOR violation, role mismatch, or insufficient permissions (code: `FORBIDDEN`).
- `404 Not Found` — Resource not found (code: `RESOURCE_NOT_FOUND`).
- `409 Conflict` — State machine conflict, duplicate offer, or concurrent selection (code: `CONFLICT`).
- `422 Unprocessable Entity` — Business rule violation (e.g. invalid status transition) (code: `BUSINESS_RULE_VIOLATION`).
- `429 Too Many Requests` — Rate limit exceeded (code: `RATE_LIMIT_EXCEEDED`).
- `500 Internal Server Error` — Unhandled error; sanitized message, zero SQL/stack traces leaked (code: `INTERNAL_ERROR`).

---

## 7. Database Constraints & Spatial Indexing

```sql
-- PostGIS Geography Point with GIST index
CREATE INDEX idx_service_requests_location ON service_requests USING GIST (location);
CREATE INDEX idx_provider_availability_location ON provider_availability USING GIST (location);

-- B-Tree indexes for fast queries
CREATE INDEX idx_service_requests_status_category ON service_requests (status, category);
CREATE INDEX idx_service_requests_customer_created ON service_requests (customer_id, created_at DESC);
CREATE INDEX idx_provider_offers_request_status ON provider_offers (request_id, status);
CREATE INDEX idx_orders_customer_created ON orders (customer_id, created_at DESC);
CREATE INDEX idx_orders_provider_created ON orders (provider_id, created_at DESC);

-- Unique & Check constraints
ALTER TABLE provider_offers ADD CONSTRAINT uq_request_provider UNIQUE (request_id, provider_id);
ALTER TABLE reviews ADD CONSTRAINT uq_order_review UNIQUE (order_id);
ALTER TABLE reviews ADD CONSTRAINT chk_rating_range CHECK (rating >= 1 AND rating <= 5);
ALTER TABLE provider_offers ADD CONSTRAINT chk_eta_range CHECK (eta_minutes > 0 AND eta_minutes <= 480);
```

---

## 8. Real-Time & Telegram Architecture (ADR-010)

- **SSE (Server-Sent Events):** Endpoint `/api/requests/[id]/events` streams live offer updates to the customer. On connection drop, client reconnects and issues a REST `GET` to synchronize full state.
- **Telegram Webhook:** Route `/api/telegram/webhook` receives bot actions.
  - Links Telegram `chat_id` to `provider_id` via secure one-time pairing code.
  - Sends lead alerts with inline buttons (`[5 000 ₸ Диагностика]`, `[7 000 ₸ Выезд]`, `[Кастомная цена]`).
  - Webhook callback queries are executed with idempotency guards.

---

## 9. Operational Admin Capabilities (In-Scope for MVP)

The admin interface (`/admin`) provides:
1. **Provider Verification:** Review uploaded business certificates, IDs, and assign verification levels.
2. **Safety-Critical Gate:** Ensures Level 3 providers cannot access safety-critical jobs.
3. **Live Inspector:** View all published requests, active orders, and cancellation reasons across Astana.
4. **Dispute Resolution:** Arbitrate disagreements between customer and provider regarding final diagnostic pricing.
5. **Account Controls:** Suspend or block fraudulent users with mandatory `admin_audit_logs` entries.
