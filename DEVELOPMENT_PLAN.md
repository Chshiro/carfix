# CARFIX — CANONICAL DEVELOPMENT PLAN

**Version:** 3.1 (Pre-Implementation P0 Corrections)  
**Date:** 2026-09-09  
**Target Market:** Astana, Kazakhstan  
**Architecture:** Single Next.js Project (App Router, TypeScript Strict, API Route Handlers, Domain Layer, Drizzle ORM, PostgreSQL 16 + PostGIS, SSE, PWA)  
**Target Duration:** 8 Weeks (Launch-Ready MVP)

---

## 1. Architectural & Product Ground Rules

1. **Architecture Style:** **Single Next.js Application** (Modular Domain Monolith). No Monorepo scaffolding, no Fastify/NestJS duplication, no Microservices, no Redis/BullMQ, no Kafka, no GraphQL, no Socket.IO.
2. **Canonical MVP Categories (Strictly 3):**
   - `electrical_starting` — Auto-electric diagnostics & starting issues
   - `battery_jumpstart` — Battery jumpstart / replacement (12V/24V)
   - `mobile_mechanic` — Minor **non-safety-critical** roadside mechanical assistance (e.g. drive belt replacement, hose fixes, spark plugs, fluid top-up). Brakes, steering, suspension, airbags/SRS, and critical fuel-system repairs are strictly EXCLUDED from MVP.
3. **Provider Capability Model (OR Matching Semantics):** Decoupled `ProviderProfile`, `ProviderType` (`STO`, `INDEPENDENT_MASTER`, `MOBILE_MASTER`), `ProviderCapability` (`BATTERY`, `AUTO_ELECTRIC`, `DIAGNOSTICS`, `MECHANICAL_MINOR`), `ProviderAvailability`, `VerificationLevel`, and `ServiceMode` (`MOBILE`, `AT_LOCATION`). `required_capabilities` represents **alternative acceptable capabilities (OR semantics)**: a provider matches if they possess *at least one* of the requested capabilities (`pc.capability = ANY(sr.required_capabilities)`).
4. **Multi-Role User Model:** User accounts hold `roles: UserRole[]` (e.g., `["motorist"]`, `["motorist", "provider"]`, `["admin"]`). Admin role cannot be self-assigned.
5. **Vehicle Optionality:** `ServiceRequest.vehicleId` is **OPTIONAL / nullable**. Emergency assistance can be requested with just Category + Location.
6. **Location Source of Truth:** Single PostGIS column `location geography(Point, 4326)` with GIST indexing and coordinate bounds validation. No duplicate lat/lng columns.
7. **Database-Driven Timers:** Request expiration (`expiresAt`), radius expansion (`nextExpansionAt`), and provider auto-offline (`autoOfflineAt`) are persisted in PostgreSQL. A server periodic worker executes transitions without losing timers on restart.
8. **Canonical State Machine:** Single 12-state model (`DRAFT` → `PUBLISHED` → `OFFERS_RECEIVED` → `PROVIDER_SELECTED` → `EN_ROUTE` → `ARRIVED` → `IN_PROGRESS` → `PENDING_COMPLETION` → `COMPLETED` / `CANCELLED` / `EXPIRED` / `DISPUTED`) with `OrderStatusHistory` audit table.
9. **Atomic Offer Selection & Concurrency:** Offer selection executes an 11-step atomic database transaction with `SELECT FOR UPDATE` on the `service_requests` row. Exactly one selection succeeds; concurrent requests receive a `409 Conflict`.
10. **Bidirectional Reviews Model:** Reviews support both parties (`customer -> provider` and `provider -> customer`) with `UNIQUE(order_id, from_user_id)`, `CHECK(from_user_id <> to_user_id)`, and `CHECK(rating >= 1 AND rating <= 5)`.
11. **Telegram Provider Channel:** Official notification and quick-action channel for providers linked via secure token (ADR-010). Core API remains single source of truth.
12. **Admin in MVP:** Minimal operational admin panel for provider document verification, request/order inspection, dispute resolution, user suspension, and audit logs.

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
    ├── Provider capability & availability engine (OR matching semantics)
    ├── Request creation (optional vehicle) & Deterministic PostGIS matching
    ├── Offer engine (3 pricing modes in tiyn) & 11-Step Atomic Selection (SELECT FOR UPDATE)
    ├── Order state machine (12 states) & OrderStatusHistory audit
    ├── Bidirectional reviews schema (UNIQUE(order_id, from_user_id))
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
    └── Earnings summary, completed job history & customer review submission

[SLICE 4] OPERATIONS, TRUST & ADMIN PANEL — Week 7
    ├── Secure Admin authentication & Role Guard
    ├── Provider verification queue (Inspect documents, assign Levels 1/2/3)
    ├── Safety-critical category enforcement gate (Bar Level 3 from safety-critical)
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

## 3. Atomic Offer Selection Transaction Specification

The core transaction in `src/server/services/order.service.ts` must execute atomically:

```sql
BEGIN;
-- 1. Lock service_request row
SELECT * FROM service_requests WHERE id = $request_id FOR UPDATE;

-- 2. Verify request status allows selection
-- Guard: status must be in ('PUBLISHED', 'OFFERS_RECEIVED')

-- 3. Verify offer belongs to this request
-- Guard: offer.request_id = $request_id

-- 4. Verify offer is still selectable
-- Guard: offer.status = 'SUBMITTED'

-- 5. Verify provider remains eligible
-- Guard: provider.is_blocked = FALSE

-- 6. Create Order record
INSERT INTO orders (id, request_id, offer_id, customer_id, provider_id, status, agreed_pricing_mode, agreed_amount_tiyn, agreed_min_tiyn, agreed_max_tiyn, created_at, updated_at)
VALUES ($order_id, $request_id, $offer_id, $customer_id, $provider_id, 'PROVIDER_SELECTED', $mode, $amount, $min, $max, NOW(), NOW());

-- 7. Mark selected offer as ACCEPTED
UPDATE provider_offers SET status = 'ACCEPTED' WHERE id = $offer_id;

-- 8. Mark other submitted offers for this request as REJECTED
UPDATE provider_offers SET status = 'REJECTED' WHERE request_id = $request_id AND id <> $offer_id AND status = 'SUBMITTED';

-- 9. Update request status to PROVIDER_SELECTED
UPDATE service_requests SET status = 'PROVIDER_SELECTED', updated_at = NOW() WHERE id = $request_id;

-- 10. Insert initial order_status_history record
INSERT INTO order_status_history (id, order_id, from_status, to_status, actor_id, actor_role, note, created_at)
VALUES ($history_id, $order_id, NULL, 'PROVIDER_SELECTED', $customer_id, 'motorist', 'Offer accepted by customer', NOW());

-- 11. Commit
COMMIT;
```

---

## 4. Comprehensive Automated Test Matrix (22 Scenarios)

| # | Test Scenario | Layer | Expected Behavior |
|---|---------------|-------|-------------------|
| 1 | Minimal Request Creation | Integration | Category + Location creates valid request with `vehicleId = null` |
| 2 | PostGIS Spatial Matching | Integration | Provider within 5km matched; provider at 15km excluded until expansion |
| 3 | Offline Provider Exclusion | Integration | Provider with `is_online = false` excluded from matching |
| 4 | Stale Location Exclusion | Integration | Provider with `location_updated_at > 4h` excluded |
| 5 | Capability-Based Matching (OR Semantics) | Integration | Request with `[AUTO_ELECTRIC, DIAGNOSTICS]` matches provider with `AUTO_ELECTRIC` |
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
| 20 | Bidirectional Review Uniqueness | Integration | Customer and provider can each submit 1 review; 2nd review by same actor returns 409 |
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
