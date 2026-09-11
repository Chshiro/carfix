# CARFIX — IMPLEMENTATION READINESS REPORT

**Date:** 2026-09-09  
**Market:** Astana, Kazakhstan  
**Status:** Pre-Implementation P0 Corrections Pass Complete  
**Final Verdict:** **READY FOR SLICE 1 IMPLEMENTATION**

---

## 1. Current Status & Specification Freeze

All 14 repository specification documents have undergone a comprehensive consistency audit and pre-implementation P0 correction pass. All four identified edge-case improvements have been formally integrated:
1. **Bidirectional Reviews Model:** `UNIQUE(order_id, from_user_id)` with `CHECK(from_user_id <> to_user_id)` and `CHECK(rating >= 1 AND rating <= 5)`.
2. **Capability Matching Semantics:** Explicit OR / alternative matching semantics (`pc.capability = ANY(sr.required_capabilities)`).
3. **Safety-Critical Scope Exclusions:** `mobile_mechanic` restricted strictly to minor non-safety-critical roadside assistance (brakes, steering, suspension, airbags, and critical fuel-systems explicitly excluded).
4. **Formal 11-Step Atomic Offer Selection Transaction:** Documented `SELECT FOR UPDATE` locking boundary preventing duplicate orders and double selections.

---

## 2. Canonical Stack Summary

* **Application Style:** **Single Next.js Application** (App Router, Route Handlers, Domain Layer, Mobile-First PWA).
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
* **Money Representation:** All prices are stored as **integer minor units (tiyn)** (1 KZT = 100 tiyn). 3 modes: `fixed`, `diagnostic_fee`, `estimate_range`.
* **Bidirectional Reviews:** Up to 2 reviews per completed order (`UNIQUE(order_id, from_user_id)`).

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
3. `mobile_mechanic` — Мелкий выездной ремонт (**только некритичный мелкий ремонт на месте**)

---

## 6. Realtime & Background Job Strategy

* **Realtime:** Next.js SSE route `/api/requests/[id]/events` streams live offer cards. On disconnect, client reconnects and issues REST `GET` to synchronize full state.
* **Database-Driven Timers:** Request expiration (`expiresAt`), radius expansion (`nextExpansionAt`), and auto-offline (`autoOfflineAt`) are stored in PostgreSQL. A 30s server-side interval worker executes due transitions without losing timers on server restart.

---

## 7. Realistic Remaining Risks & Mitigations

1. **Marketplace Liquidity Risk:** Mitigated through Phase 0.5 supply validation gate (recruiting and onboarding 15–20 real technicians in target districts before public marketing).
2. **Provider Response Speed & Offline Discipline:** Mitigated through Telegram Bot instant push alerts with 1-tap inline bidding and 4-hour auto-offline protection.
3. **On-Site Pricing Disputes:** Mitigated through explicit `diagnostic_fee` mode separating callout diagnostic fee from repair estimate, plus Admin dispute arbitration.
4. **Standard Runtime / Implementation Edge Cases:** Mitigated by 22-scenario automated integration test matrix covering concurrency, IDOR, spatial radius, and state machine transitions.

---

## 8. Final Implementation Decision

# 👉 **VERDICT: READY FOR SLICE 1 IMPLEMENTATION**

The specifications are completely frozen and unambiguous. The engineering execution can proceed directly into **Slice 1: Domain + Transaction Core**.
