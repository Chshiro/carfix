# CARFIX — CANONICAL ARCHITECTURE AUDIT

**Version:** 2.0 (Canonical Consistency Pass)  
**Date:** 2026-09-09  
**Status:** All Architectural Conflicts Resolved

---

## 1. Architectural Component Evaluation

| Component | Architecture Role | Chosen Solution | Action & Justification |
|---|---|---|---|
| **Application Architecture** | Core Engine | **Single Next.js Modular Monolith** | **Canonical Decision.** Replaced monorepo/Fastify duality. Eliminates build complexity for a solo engineer while maintaining clean domain layering (`src/server/services`). |
| **Persistence & Spatial** | Data Layer | **PostgreSQL 16 + PostGIS** | **Keep.** `geography(Point, 4326)` with GIST indexing provides native, scalable spherical radius queries (`ST_DWithin`) in Astana. |
| **Data Access** | ORM | **Drizzle ORM** | **Keep.** Type-safe SQL generation, schema-first migrations, native raw SQL support for PostGIS. |
| **Realtime Updates** | Live Client Feed | **Server-Sent Events (SSE)** | **Keep.** Lightweight, unidirectional stream from server to customer with automatic REST state synchronization on reconnect. |
| **Provider Notification** | Lead Dispatch | **Telegram Bot Webhook (ADR-010)** | **Keep.** Direct, high-conversion channel for mechanics on the road in Astana with 1-tap inline bidding. |
| **Background Execution** | Business Timers | **Database-Driven Timers + Periodic Worker** | **Keep.** Persisted `expires_at`, `next_expansion_at`, and `auto_offline_at` in PostgreSQL. Resilient to server restarts without Redis. |
| **Admin Operations** | Trust & Moderation | **Next.js `/admin` Interface** | **Included in MVP.** Operational control over provider document verification, disputes, and safety restrictions. |
| **Payments** | Settlement | **Direct (Kaspi QR / Cash)** | **Deferred.** Escrow billing excluded from MVP to prioritize transaction liquidity over financial complexity. |
| **AI / Computer Vision** | Damage Estimation | **Deferred Post-MVP** | **Excluded from MVP.** Zero dependency on LLM/AI for the core transaction loop. |

---

## 2. Concurrency & Concurrency Failure Modes Mitigated

1. **Double Selection Race:** Prevented by executing `SELECT FOR UPDATE` on the `service_requests` row during offer acceptance within an isolated database transaction.
2. **Duplicate Offer Spam:** Prevented by database constraint `UNIQUE(request_id, provider_id)`.
3. **Expired Request Bidding:** Checked at domain layer; offers on requests with `expires_at <= NOW()` are rejected with `409 Conflict`.
4. **IDOR Data Leakage:** Every endpoint enforces strict ownership checks; customer phone numbers and exact coordinates are masked until an offer is accepted.
