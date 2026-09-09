# CARFIX — CANONICAL SYSTEM ARCHITECTURE

**Version:** 2.1 (Pre-Implementation P0 Corrections)  
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
│  │ - RequestService & Deterministic PostGIS Matching (OR Semantics) │  │
│  │ - OfferService (Fixed / Diagnostic Fee / Range in Tiyn)          │  │
│  │ - OrderService (12-State Machine + 11-Step Atomic Selection)     │  │
│  │ - ReviewService (Bidirectional 1–5 Star Rating Recalculation)    │  │
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
│  │ - Atomic offer acceptance: 11-step transaction with row lock     │  │
│  │ - Database-driven timers: expiresAt, nextExpansionAt             │  │
│  │ - Complete audit trail: order_status_history, admin_audit_logs   │  │
│  │ - Bidirectional reviews: UNIQUE(order_id, from_user_id)          │  │
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

### 3.2 Provider & Capabilities (OR Matching Semantics)
A provider is decoupled into:
- `ProviderProfile`: business name, provider type (`STO`, `INDEPENDENT_MASTER`, `MOBILE_MASTER`), verification level (`LEVEL_1_VERIFIED_SERVICE`, `LEVEL_2_VERIFIED_MASTER`, `LEVEL_3_NEW_PROVIDER`), description.
- `ProviderCapability`: list of verified capabilities (`BATTERY`, `AUTO_ELECTRIC`, `DIAGNOSTICS`, `MECHANICAL_MINOR`).
- `ProviderAvailability`: `is_online` flag, `location geography(Point, 4326)`, `radius_km` (default 10), `location_updated_at`, `auto_offline_at`.
- `ServiceMode`: supported modes (`MOBILE`, `AT_LOCATION`).

**Capability Matching Semantics:** `required_capabilities` represents **alternative acceptable capabilities (OR semantics)**. A provider is eligible if they possess *at least one* capability matching the request:
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

### 3.3 Scope Restriction for `mobile_mechanic`
- `mobile_mechanic` is strictly restricted to **minor non-safety-critical roadside mechanical assistance** (drive belts, hoses, spark plugs, basic fluid leaks/top-up).
- Brakes, steering, critical suspension, airbags/SRS, and critical fuel-system work are **strictly EXCLUDED** from MVP and will require a specialized safety-critical verification gate (Level 1/2 only) if introduced post-MVP.

### 3.4 Vehicles
- Vehicles are stored in a user's garage (`make`, `model`, `year`, `license_plate`).
- **Vehicle is optional on ServiceRequest:** `vehicle_id` is nullable. A motorist in an emergency can create a request with just category and location.

### 3.5 Money & Pricing Model
- All monetary values are stored as **integer minor units (tiyn)**. 1 KZT = 100 tiyn (e.g. 5 000 ₸ = `500000`).
- 3 pricing modes:
  1. `fixed`: `amount_tiyn > 0`
  2. `diagnostic_fee`: `amount_tiyn > 0` (final repair price agreed after on-site diagnosis)
  3. `estimate_range`: `min_amount_tiyn > 0` and `max_amount_tiyn >= min_amount_tiyn`

---

## 4. Canonical Order State Machine (12 States)

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
│ OFFERS_RECEIVED     │ PROVIDER_SELECTED    │ Customer           │ 11-Step Atomic Selection Transaction │
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

## 5. Canonical Atomic Offer Selection Flow (11 Steps)

Offer acceptance must execute as a single atomic transaction:

```
BEGIN
  1. SELECT service_request FOR UPDATE (lock row)
  2. Verify request status allows selection (must be 'PUBLISHED' or 'OFFERS_RECEIVED')
  3. Verify offer belongs to this request (offer.request_id = service_request.id)
  4. Verify offer is still selectable (offer.status = 'SUBMITTED')
  5. Verify provider remains eligible (provider is active, not suspended/blocked)
  6. Create Order record (status = 'PROVIDER_SELECTED')
  7. Mark selected offer as ACCEPTED
  8. Mark all other submitted offers for this request as REJECTED
  9. Update service_request status to PROVIDER_SELECTED
  10. Insert initial order_status_history record (from_status = NULL, to_status = 'PROVIDER_SELECTED')
COMMIT
```

*Concurrency guarantee:* If two selection requests occur simultaneously, exactly one succeeds, the other receives `409 Conflict`, zero duplicate orders are created, and no request can have multiple accepted offers.

---

## 6. Security & Authorization (Anti-IDOR Matrix)

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
| `Review` | Create | Motorist, Provider | Participant in order (`from_user_id = user.id`) AND `order.status = 'COMPLETED'` |
| `Admin Queue` | Moderate | Admin | `user.roles` contains `'admin'` |

---

## 7. Database Constraints & Schema Rules

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
CREATE INDEX idx_reviews_to_user ON reviews (to_user_id);

-- Unique & Check constraints
ALTER TABLE provider_offers ADD CONSTRAINT uq_request_provider UNIQUE (request_id, provider_id);

-- Bidirectional Reviews (max 2 per order: customer -> provider, provider -> customer)
ALTER TABLE reviews ADD CONSTRAINT uq_order_from_user UNIQUE (order_id, from_user_id);
ALTER TABLE reviews ADD CONSTRAINT chk_review_distinct_users CHECK (from_user_id <> to_user_id);
ALTER TABLE reviews ADD CONSTRAINT chk_rating_range CHECK (rating >= 1 AND rating <= 5);

ALTER TABLE provider_offers ADD CONSTRAINT chk_eta_range CHECK (eta_minutes > 0 AND eta_minutes <= 480);
```

---

## 8. Standard API Error Contract

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
- `400 Bad Request` — Invalid input, schema validation failure (`VALIDATION_ERROR`).
- `401 Unauthorized` — Missing or expired JWT token (`UNAUTHORIZED`).
- `403 Forbidden` — IDOR violation, role mismatch, or insufficient permissions (`FORBIDDEN`).
- `404 Not Found` — Resource not found (`RESOURCE_NOT_FOUND`).
- `409 Conflict` — State machine conflict, duplicate offer, concurrent selection (`CONFLICT`).
- `422 Unprocessable Entity` — Business rule violation (`BUSINESS_RULE_VIOLATION`).
- `429 Too Many Requests` — Rate limit exceeded (`RATE_LIMIT_EXCEEDED`).
- `500 Internal Server Error` — Unhandled error; sanitized message, zero SQL/stack traces leaked (`INTERNAL_ERROR`).
