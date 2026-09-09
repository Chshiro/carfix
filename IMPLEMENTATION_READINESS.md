# CARFIX — IMPLEMENTATION READINESS REPORT

**Date:** 2026-09-09  
**Market:** Astana, Kazakhstan  
**Status:** Canonical Pre-Implementation Pass Complete  
**Final Verdict:** **READY**

---

## 1. Current Status

The pre-implementation architectural and product consistency pass is complete. All 14 repository specification documents have been audited, cross-checked, and synchronized. Zero architectural ambiguities or conflicting choices remain.

---

## 2. Canonical Stack Summary

* **Application Style:** **Single Next.js Application** (App Router, Route Handlers, Domain Layer, Mobile-First PWA). No multi-app monorepo, no Fastify/NestJS duality.
* **Language & Type Safety:** TypeScript with strict compilation flags.
* **Database:** **PostgreSQL 16 + PostGIS extension** (`geography(Point, 4326)` with GIST spatial index).
* **ORM:** **Drizzle ORM** (`drizzle-orm`, `drizzle-kit`) with schema-first migrations.
* **Realtime Updates:** **Server-Sent Events (SSE)** with REST re-synchronization on reconnect.
* **Provider Channel:** **Telegram Bot Webhook (@CarFixPartnerBot)** with inline 1-tap bidding (ADR-010).
* **Storage:** S3-compatible object storage with pre-signed upload URLs and UUID storage keys.
* **Infrastructure Exclusions (Boring Tech):** Zero Redis, zero message queues (Kafka/RabbitMQ), zero microservices, zero ML/AI dependencies in MVP.

---

## 3. Canonical Domain Model

* **Multi-Role Users:** Accounts hold `roles: UserRole[]` (`['motorist']`, `['motorist', 'provider']`, `['admin']`). Admin role is protected from client-side assignment.
* **Decoupled Provider Model:** `ProviderProfile` (business details, verification level) + `ProviderType` (`STO`, `INDEPENDENT_MASTER`, `MOBILE_MASTER`) + `ProviderCapability` (`BATTERY`, `AUTO_ELECTRIC`, `DIAGNOSTICS`, `MECHANICAL_MINOR`) + `ProviderAvailability` (`is_online`, `location geography(Point, 4326)`, `auto_offline_at`) + `ServiceMode` (`MOBILE`, `AT_LOCATION`).
* **Vehicles:** Stored in user's garage. **Optional on ServiceRequest:** Motorists can request urgent assistance with just category + location.
* **Money Representation:** All prices are stored as **integer minor units (tiyn)** (1 KZT = 100 tiyn). Floating-point arithmetic is strictly forbidden. 3 modes: `fixed`, `diagnostic_fee`, `estimate_range`.

---

## 4. Canonical Order State Machine (12 States)

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
Every status change generates an immutable entry in `order_status_history`.

---

## 5. Canonical MVP Categories (Strictly 3)

1. `electrical_starting` — Автоэлектрика и запуск
2. `battery_jumpstart` — Аккумулятор и прикурка (12V/24V)
3. `mobile_mechanic` — Мелкий выездной ремонт

*(Tire service and towing are deferred post-MVP to maximize supply density in electrical/starting emergencies).*

---

## 6. Security, Authorization & Concurrency Rules

* **Anti-IDOR Matrix:** Resource ownership is validated in the domain layer for every request. Customer exact coordinates and phone numbers are hidden from providers until offer selection.
* **Concurrency Locking:** Offer selection uses `SELECT FOR UPDATE` within a database transaction to prevent double selection.
* **Offer Uniqueness:** Enforced via `UNIQUE(request_id, provider_id)` constraint.
* **File Uploads:** Validated via MIME type and magic bytes; pre-signed upload URLs with randomized UUID keys; max 3 images per request.
* **Error Contract:** Standard JSON `{ "error": { "code": "...", "message": "...", "details": {} } }` with sanitized messages (no SQL / stack traces).

---

## 7. Realtime & Background Job Strategy

* **Realtime:** Next.js SSE route `/api/requests/[id]/events` streams live offer cards. On disconnect, client reconnects and issues REST `GET` to synchronize full state.
* **Database-Driven Timers:** Request expiration (`expiresAt`), radius expansion (`nextExpansionAt`), and auto-offline (`autoOfflineAt`) are stored in PostgreSQL. A 30s server-side interval worker executes due transitions without losing timers on server restart.

---

## 8. Marketplace Validation Gate (Phase 0.5)

Before open public launch in Astana:
- >= 20 providers contacted in Esil/Almaty districts.
- >= 10 providers onboarded into Telegram Bot.
- >= 5 active providers online during peak hours.
- Test request receives >= 2 relevant offers in < 5 minutes.
- >= 5 real/concierge pilot orders successfully completed.

---

## 9. Remaining Non-Blocking Risks

1. **Cold-Start Liquidity in Astana:** Addressed via operational Phase 0.5 gate (manual recruiting of 15–20 technicians before marketing).
2. **Provider Offline Behavior:** Addressed via 4-hour automatic offline timeout and Telegram push notifications.
3. **Price Disagreements on Site:** Addressed via explicit `diagnostic_fee` mode and Admin dispute arbitration.

---

## 10. Final Implementation Decision

# 👉 **VERDICT: READY**

The repository is in a fully consistent, canonical, and unambiguous state. A developer can immediately begin **Slice 1 (Domain + Transaction Core)** without guessing or improvising architecture.
