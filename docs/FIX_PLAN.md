# CARFIX — CANONICAL FIX PLAN

**Version:** 2.1 (Post-P0 Corrections Pass)  
**Date:** 2026-09-09  
**Status:** All Pre-Implementation Specification Fixes Completed & Verified

---

## 1. Resolved Specification Inconsistencies (P0 Fixes)

All architectural ambiguities and edge-case fixes have been resolved and synchronized across all documentation files:

| Issue ID | Area | Resolution Summary | Status |
|---|---|---|---|
| **FIX-01** | Stack Selection | Standardized on **Single Next.js Application** (App Router, Route Handlers, Drizzle ORM, PostGIS). Removed Fastify/Monorepo references. | **RESOLVED** |
| **FIX-02** | MVP Categories | Fixed strictly to **3 categories**: `electrical_starting`, `battery_jumpstart`, `mobile_mechanic`. | **RESOLVED** |
| **FIX-03** | User Roles | Replaced single-role string with multi-role array `roles: UserRole[]` (e.g. `['motorist', 'provider']`). | **RESOLVED** |
| **FIX-04** | Vehicle Optionality | Made `vehicleId` nullable on `ServiceRequest`. Emergency requests can be published with just category + location. | **RESOLVED** |
| **FIX-05** | Provider Model | Decoupled `ProviderProfile`, `ProviderType`, `ProviderCapability`, `ProviderAvailability`, and `ServiceMode`. | **RESOLVED** |
| **FIX-06** | State Machine | Standardized on single 12-state finite state machine with mandatory `OrderStatusHistory` audit table. | **RESOLVED** |
| **FIX-07** | Timers & Workers | Replaced in-memory timers with database-driven fields (`expiresAt`, `nextExpansionAt`, `autoOfflineAt`) and interval worker. | **RESOLVED** |
| **FIX-08** | Money Model | Standardized on integer minor units (tiyn, 1 KZT = 100 tiyn) across 3 pricing modes (`fixed`, `diagnostic_fee`, `estimate_range`). | **RESOLVED** |
| **FIX-09** | Telegram Integration | Formalized Telegram Bot as official provider notification and quick-action channel (ADR-010). | **RESOLVED** |
| **FIX-10** | Admin Module | Included minimal operational admin panel directly in MVP scope (verification, live inspector, disputes). | **RESOLVED** |
| **FIX-11** | Concurrency & IDOR | Added 11-step atomic offer selection with `SELECT FOR UPDATE` and resource ownership matrix. | **RESOLVED** |
| **FIX-12** | Business Validation Gate | Added explicit Phase 0.5 supply validation gate in development plan. | **RESOLVED** |
| **FIX-13 (P0-1)** | Reviews Model | Replaced `UNIQUE(order_id)` with `UNIQUE(order_id, from_user_id)` to allow bidirectional reviews with distinct user checks. | **RESOLVED** |
| **FIX-14 (P0-2)** | Capability Semantics | Defined explicit OR / alternative matching semantics for `required_capabilities` (`pc.capability = ANY(sr.required_capabilities)`). | **RESOLVED** |
| **FIX-15 (P0-3)** | Safety Exclusions | Strictly restricted `mobile_mechanic` to non-safety-critical roadside repairs (brakes, steering, suspension, airbags excluded). | **RESOLVED** |
| **FIX-16 (P0-4)** | Atomic Selection Flow | Documented the formal 11-step atomic transaction boundary for offer selection in architecture and decisions. | **RESOLVED** |

---

## 2. P1 & P2 Implementation Backlog

### P1 — Core Operational Reliability (Weeks 3–7)
- [ ] Implement client-side image compression (< 500KB) via HTML5 canvas.
- [ ] Enforce strict MIME and magic-byte validation on file upload route handlers.
- [ ] Setup structured JSON logging with correlation `requestId` for all API calls.
- [ ] Configure SSE reconnect handler with full REST state synchronization.
- [ ] Setup live marketplace health metric calculations (Time to First Offer, Offer Rate, Completion Rate).

### P2 — Future Expansion (Post-MVP / Phase 6+)
- [ ] In-app escrow payment integration (Kaspi Pay / Freedom Pay).
- [ ] Multi-city localization (Almaty, Shymkent) and Kazakh language translation.
- [ ] B2B fleet accounts (taxi fleets, corporate delivery vehicles).
- [ ] AI-assisted request structuring (LLM-based classification).
