# CARFIX — CANONICAL DEVELOPMENT PLAN

**Version:** 3.0 (Canonical Consistency Pass)  
**Date:** 2026-09-09  
**Target Market:** Astana, Kazakhstan  
**Architecture:** Single Next.js Project (App Router, TypeScript Strict, API Route Handlers, Domain Layer, Drizzle ORM, PostgreSQL 16 + PostGIS, SSE, PWA)  
**Target Duration:** 8 Weeks (Launch-Ready MVP)

---

## 1. Architectural & Product Ground Rules

1. **Architecture Style:** **Single Next.js Application** (Modular Domain Monolith). No Monorepo scaffolding, no Fastify/NestJS duplication, no Microservices, no Redis/BullMQ, no Kafka, no GraphQL, no Socket.IO.
2. **Canonical MVP Categories (Strictly 3):**
   - `electrical_starting` — Auto-electric diagnostics & starting issues
   - `battery_jumpstart` — Battery jumpstart / replacement
   - `mobile_mechanic` — Minor roadside mechanical repairs
   *(Tire service, towing, bodywork, and complex repairs are explicitly DEFERRED post-MVP).*
3. **Provider Capability Model:** Decoupled `ProviderProfile`, `ProviderType` (`STO`, `INDEPENDENT_MASTER`, `MOBILE_MASTER`), `ProviderCapability` (`BATTERY`, `AUTO_ELECTRIC`, `DIAGNOSTICS`, `MECHANICAL_MINOR`), `ProviderAvailability`, `VerificationLevel`, and `ServiceMode` (`MOBILE`, `AT_LOCATION`).
4. **Multi-Role User Model:** User accounts hold `roles: UserRole[]` (e.g., `["motorist"]`, `["motorist", "provider"]`, `["admin"]`). Admin role cannot be self-assigned.
5. **Vehicle Optionality:** `ServiceRequest.vehicleId` is **OPTIONAL / nullable**. Emergency assistance can be requested with just Category + Location.
6. **Location Source of Truth:** Single PostGIS column `location geography(Point, 4326)` with GIST indexing and coordinate bounds validation. No duplicate lat/lng columns.
7. **Database-Driven Timers:** Request expiration (`expiresAt`), radius expansion (`nextExpansionAt`), and provider auto-offline (`autoOfflineAt`) are persisted in PostgreSQL. A server periodic worker executes transitions without losing timers on restart.
8. **Canonical State Machine:** Single 12-state model (`DRAFT` → `PUBLISHED` → `OFFERS_RECEIVED` → `PROVIDER_SELECTED` → `EN_ROUTE` → `ARRIVED` → `IN_PROGRESS` → `PENDING_COMPLETION` → `COMPLETED` / `CANCELLED` / `EXPIRED` / `DISPUTED`) with `OrderStatusHistory` audit table.
9. **Idempotency & Concurrency:** `UNIQUE(request_id, provider_id)` for offers, `SELECT FOR UPDATE` transaction for offer selection, idempotent status transitions and Telegram callbacks.
10. **Telegram Provider Channel:** Official notification and quick-action channel for providers linked via secure token (ADR-010). Core API remains single source of truth.
11. **Admin in MVP:** Minimal operational admin panel for provider document verification, request/order inspection, dispute resolution, user suspension, and audit logs.

---

## 2. Canonical Development Sequence

```
[PHASE 0.5] SUPPLY VALIDATION GATE (Continuous Operational Gate)
    ├── Recruit 10–20 providers in Astana (Esil/Almaty districts)
    ├── >= 5 active providers committed to pilot
    └── Manual concierge test requests (verify response time < 5 min)

[SLICE 1] DOMAIN + TRANSACTION CORE (API + PostGIS + Drizzle + E2E Tests) — Weeks 1–2
    ├── Project skeleton (Next.js App Router, TypeScript strict, Drizzle, PostGIS)
    ├── Database schema with constraints, indexes, and geography Point
    ├── Auth (Phone OTP + JWT access/refresh) & Multi-Role authorization
    ├── Provider capability & availability engine
    ├── Request creation (optional vehicle) & Deterministic PostGIS matching
    ├── Offer engine (3 pricing modes in tiyn) & Atomic selection (SELECT FOR UPDATE)
    ├── Order state machine (12 states) & OrderStatusHistory audit
    ├── Database-driven timers (expiration, expansion, auto-offline)
    ├── Standard error contract & IDOR authorization rules
    └── Automated E2E integration test suite (22 test scenarios)

[SLICE 2] CUSTOMER PWA EXPERIENCE — Weeks 3–4
    ├── Mobile-first PWA shell (manifest, responsive layout)
    ├── Phone OTP login/registration UI
    ├── 2-step Request creation (Category + Location + Optional Vehicle/Photos)
    ├── Real-time Offer comparison feed (SSE + REST reload on reconnect)
    ├── Provider profile modal with verification badge and reviews
    ├── Active Order tracker with Call/WhatsApp direct actions
    └── Order completion, final price confirmation & 1–5 star rating UI

[SLICE 3] PROVIDER EXPERIENCE & TELEGRAM INTEGRATION — Weeks 5–6
    ├── Provider registration, capability selection & document upload
    ├── One-tap Online/Offline toggle with GPS capture
    ├── Telegram Bot integration (account binding, instant alert webhooks)
    ├── Quick-bidding from Telegram or Web (Fixed, Diagnostic Fee, Range)
    ├── Provider order execution screen (En Route → Arrived → In Progress → Complete)
    └── Earnings summary & completed job history

[SLICE 4] OPERATIONS, TRUST & ADMIN PANEL — Week 7
    ├── Secure Admin authentication & Role Guard
    ├── Provider verification queue (Inspect documents, assign Levels 1/2/3)
    ├── Safety-critical category enforcement gate
    ├── Live request & order inspection across Astana
    ├── Dispute & complaint resolution workflow
    └── Admin audit trail & basic marketplace health metrics

[SLICE 5] FIELD PILOT & PRODUCTION HARDENING — Week 8
    ├── Production deployment (Docker, PostgreSQL 16 + PostGIS, HTTPS/SSL)
    ├── Network resilience, PWA offline handling & rate limiting
    ├── Onboard first 15–20 real providers into Telegram Bot
    └── Execute closed pilot in pilot district (Esil/Almaty) with real transactions
```

---

## 3. Detailed Slice Specifications

### Phase 0.5 — Supply Validation Gate (Operational Milestone)
* **Goal:** Confirm supply willingness before scaling engineering assumptions.
* **Gate Requirements:**
  - Contact at least 20 auto electricians and mobile mechanics in Astana.
  - At least 10 express willingness to receive leads.
  - At least 5 active providers onboarded in the pilot district.
  - Run manual concierge test requests: verify >= 2 relevant responses within 15 minutes.
  - Complete >= 5 manual pilot transactions.

---

### Slice 1 — Domain + Transaction Core (Weeks 1–2)

#### 1.1 Technical Stack & Foundation
- Next.js 14+ with App Router (single repo, `src/app/api/...` route handlers).
- TypeScript in `strict` mode (`noImplicitAny: true`, `strictNullChecks: true`).
- PostgreSQL 16 with PostGIS extension (`geography(Point, 4326)`).
- Drizzle ORM (`drizzle-orm`, `drizzle-kit`) with schema-first migrations.
- Authentication: Phone OTP with mock provider for development, JWT via `jose` (15m access token, 30d refresh token).

#### 1.2 Data Model & Schema
- `users`: ID (UUID), phone, roles (`varchar[]`), created_at, updated_at, is_blocked.
- `providers`: ID (UUID), user_id, business_name, provider_type (`STO`, `INDEPENDENT_MASTER`, `MOBILE_MASTER`), verification_level (`LEVEL_1_VERIFIED_SERVICE`, `LEVEL_2_VERIFIED_MASTER`, `LEVEL_3_NEW_PROVIDER`), description, created_at.
- `provider_capabilities`: provider_id, capability (`BATTERY`, `AUTO_ELECTRIC`, `DIAGNOSTICS`, `MECHANICAL_MINOR`), is_active.
- `provider_availability`: provider_id, is_online, location `geography(Point, 4326)`, radius_km (default 10), location_updated_at, auto_offline_at.
- `vehicles`: ID (UUID), user_id, make, model, year, license_plate (optional).
- `service_requests`: ID (UUID), customer_id, category (`electrical_starting`, `battery_jumpstart`, `mobile_mechanic`), required_capabilities (`varchar[]`), vehicle_id (nullable), description (optional), location `geography(Point, 4326)`, status (enum), current_radius_km (default 5), published_at, expires_at, next_expansion_at.
- `request_media`: ID (UUID), request_id, file_key, file_url, created_at (max 3 per request).
- `provider_offers`: ID (UUID), request_id, provider_id, pricing_mode (`fixed`, `diagnostic_fee`, `estimate_range`), amount_tiyn, min_amount_tiyn, max_amount_tiyn, eta_minutes, message, status (`SUBMITTED`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`), created_at. `UNIQUE(request_id, provider_id)`.
- `orders`: ID (UUID), request_id, offer_id, customer_id, provider_id, status (enum), agreed_pricing_mode, agreed_amount_tiyn, agreed_min_tiyn, agreed_max_tiyn, final_amount_tiyn, cancellation_reason, cancelled_by, created_at, updated_at.
- `order_status_history`: ID (UUID), order_id, from_status, to_status, actor_id, actor_role, note, created_at.
- `reviews`: ID (UUID), order_id (UNIQUE), from_user_id, to_user_id, rating (1–5), comment, created_at.
- `notifications`: ID (UUID), user_id, type, title, body, payload (JSON), is_read, created_at.
- `admin_audit_logs`: ID (UUID), admin_user_id, action, target_type, target_id, payload (JSON), created_at.

#### 1.3 State Machine & Order Lifecycle
```
[DRAFT] ───────► [PUBLISHED] ───────► [OFFERS_RECEIVED] ───────► [PROVIDER_SELECTED]
    │                 │                     │                            │
    ▼                 ▼                     ▼                            ▼
[CANCELLED]       [CANCELLED]           [CANCELLED]                  [CANCELLED]
                      │                     │
                      ▼                     ▼
                  [EXPIRED]             [EXPIRED]

[PROVIDER_SELECTED] ──► [EN_ROUTE] ──► [ARRIVED] ──► [IN_PROGRESS] ──► [PENDING_COMPLETION]
        │                   │              │                │                  │
        ▼                   ▼              ▼                ▼                  ▼
   [CANCELLED]         [CANCELLED]    [CANCELLED]      [CANCELLED]        [DISPUTED]
                                                                               │
                                                                               ▼
[PENDING_COMPLETION] ───────────────────────────────────────────────► [COMPLETED]
```

#### 1.4 Background Worker & Database Timers
- Node.js lightweight background interval (every 30s):
  1. `Check Expiration`: `UPDATE service_requests SET status = 'EXPIRED' WHERE status IN ('PUBLISHED', 'OFFERS_RECEIVED') AND expires_at <= NOW()`
  2. `Check Radius Expansion`: `UPDATE service_requests SET current_radius_km = LEAST(current_radius_km + 5, 20), next_expansion_at = NOW() + INTERVAL '3 minutes' WHERE status IN ('PUBLISHED', 'OFFERS_RECEIVED') AND next_expansion_at <= NOW() AND current_radius_km < 20`
  3. `Check Auto-Offline`: `UPDATE provider_availability SET is_online = FALSE WHERE is_online = TRUE AND auto_offline_at <= NOW()`

---

### Slice 2 — Customer PWA (Weeks 3–4)
- **Goal:** Frictionless request creation (< 2 mins) and live offer review.
- Mobile PWA shell with manifest and responsive layout.
- 2-step request creation:
  - Step 1: Select category (3 MVP categories), optional description, optional 1–3 photo uploads with client-side canvas compression (< 500KB).
  - Step 2: Location capture (Browser Geolocation API + map preview) and optional vehicle selection.
- Live Offer Feed: SSE stream with fallback to manual REST refresh.
- Offer selection modal showing pricing breakdown, provider verification badge, rating, and distance.
- Direct Call / WhatsApp contact unlock upon selection.
- Order completion screen with final price confirmation and 1–5 star rating submission.

---

### Slice 3 — Provider Experience & Telegram Integration (Weeks 5–6)
- **Goal:** Fast, reliable lead notifications and one-tap bidding for technicians.
- Provider setup: Select capabilities, upload ID/ИП document, configure base radius.
- Availability toggle: Online/Offline with GPS coordinate refresh.
- Telegram Bot (@CarFixPartnerBot):
  - Account linking via secure one-time token.
  - Real-time lead alert when request is published within provider's radius.
  - Inline keyboard for rapid bidding (`[5 000 ₸ Диагностика]` / `[Кастомная цена]` / `[Пропустить]`).
- Web Provider Dashboard: Full request details, active order status controls (`[В пути]`, `[На месте]`, `[Начал работу]`, `[Завершил]`).

---

### Slice 4 — Operations, Trust & Admin Panel (Week 7)
- **Goal:** Operational control, provider quality moderation, and dispute handling.
- Admin auth with dedicated role enforcement.
- Provider Verification Queue: Review uploaded documents and assign:
  - `LEVEL_1_VERIFIED_SERVICE` (Registered auto repair shop with physical address)
  - `LEVEL_2_VERIFIED_MASTER` (Verified independent master with verified ID/ИП)
  - `LEVEL_3_NEW_PROVIDER` (Unverified new provider, restricted categories)
- Request & Order Inspector: Full view of live marketplace activity.
- Dispute Resolution: Arbitrate price disagreements, update order status to `COMPLETED` or `CANCELLED`.
- User & Provider management: Suspend / block fraudulent accounts with audit logging.

---

### Slice 5 — Field Pilot & Hardening (Week 8)
- Production deployment on Linux VPS with Docker Compose, PostgreSQL 16 + PostGIS, Caddy / Nginx reverse proxy with SSL.
- Security audit: IDOR verification on all endpoints, IP and phone rate limiting.
- Onboard 15–20 active auto electricians and mobile mechanics in Astana (Esil/Almaty districts).
- Execute closed pilot with real emergency breakdown requests.

---

## 4. Comprehensive Automated Test Matrix (22 Scenarios)

| # | Test Scenario | Layer | Expected Behavior |
|---|---------------|-------|-------------------|
| 1 | Minimal Request Creation | Integration | Category + Location creates valid request with `vehicleId = null` |
| 2 | PostGIS Spatial Matching | Integration | Provider within 5km matched; provider at 15km excluded until expansion |
| 3 | Offline Provider Exclusion | Integration | Provider with `is_online = false` excluded from matching |
| 4 | Stale Location Exclusion | Integration | Provider with `location_updated_at > 4h` excluded |
| 5 | Capability-Based Matching | Integration | Request requiring `AUTO_ELECTRIC` matches only providers with that capability |
| 6 | Verification Level Gate | Integration | Level 3 provider excluded from safety-critical requests |
| 7 | Unique Offer Constraint | Integration | Duplicate offer from same provider on same request returns 409 Conflict |
| 8 | Atomic Offer Selection | Concurrency | 2 concurrent selections on same request: exactly 1 succeeds, 1 returns 409 Conflict |
| 9 | IDOR Protection (Requests) | Security | Customer A cannot view/cancel Customer B's request (returns 403) |
| 10 | IDOR Protection (Orders) | Security | Provider A cannot update Provider B's order status (returns 403) |
| 11 | Illegal State Transition | Unit | Transition `EN_ROUTE` → `COMPLETED` directly is rejected (400 Bad Request) |
| 12 | Database Timer Persistence | Integration | Expired request marked `EXPIRED` by background worker after server restart |
| 13 | Radius Expansion Worker | Integration | Request radius expands from 5km to 10km after 3 minutes if no offers accepted |
| 14 | Provider Auto-Offline | Integration | Inactive online provider automatically switched offline after `autoOfflineAt` |
| 15 | SSE Stream & Reconnect | Integration | Client reconnecting via REST receives accurate latest state |
| 16 | Telegram Webhook Idempotency | Integration | Duplicate Telegram callback query executes action only once |
| 17 | Customer Geolocation Privacy | Security | Provider sees approximate distance (~2.5km) but not exact coordinates before selection |
| 18 | Contact Exchange Privacy | Security | Customer phone number hidden from provider until offer is selected |
| 19 | Rating Eligibility Check | Integration | Rating before order status is `COMPLETED` is rejected |
| 20 | Rating Uniqueness | Integration | Submitting second rating on same order returns 409 Conflict |
| 21 | Final Price Validation | Integration | Final price in diagnostic fee mode must be integer > 0 in tiyn |
| 22 | Admin Action Audit | Integration | Provider verification change creates immutable `admin_audit_logs` record |

---

## 5. Marketplace Readiness Gate Checklist

Before launching the service to the general public in Astana:
- [ ] Minimum 20 providers contacted in target pilot districts.
- [ ] Minimum 10 providers onboarded and verified in Telegram Bot.
- [ ] Minimum 5 active providers online during peak hours (08:00–20:00).
- [ ] Test request receives >= 2 qualified offers in < 5 minutes.
- [ ] Minimum 5 end-to-end pilot orders completed successfully with positive customer feedback.
- [ ] All 22 automated integration tests pass in CI/CD pipeline.
