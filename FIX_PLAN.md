# CARFIX — CANONICAL FIX PLAN

**Version:** 2.0 (Post-Consistency Pass)  
**Date:** 2026-09-09  
**Status:** Pre-Implementation Specification Fixes Completed

---

## 1. Resolved Specification Inconsistencies (P0 Fixes)

All architectural ambiguities identified during the audit pass have been resolved across all documentation files:

| Issue ID | Area | Resolution Summary | Status |
|---|---|---|---|
| **FIX-01** | Stack Selection | Standardized on **Single Next.js Application** (App Router, Route Handlers, Drizzle ORM, PostGIS). Removed Fastify/Monorepo references. | **RESOLVED** |
| **FIX-02** | MVP Categories | Fixed strictly to **3 categories**: `electrical_starting`, `battery_jumpstart`, `mobile_mechanic`. Tire service and towing deferred. | **RESOLVED** |
| **FIX-03** | User Roles | Replaced single-role string with multi-role array `roles: UserRole[]` (e.g. `['motorist', 'provider']`). Admin role protected. | **RESOLVED** |
| **FIX-04** | Vehicle Optionality | Made `vehicleId` nullable on `ServiceRequest`. Emergency requests can be published with just category + location. | **RESOLVED** |
| **FIX-05** | Provider Model | Decoupled `ProviderProfile`, `ProviderType`, `ProviderCapability`, `ProviderAvailability`, and `ServiceMode`. Matching evaluates required capabilities. | **RESOLVED** |
| **FIX-06** | State Machine | Standardized on single 12-state finite state machine with mandatory `OrderStatusHistory` audit table. | **RESOLVED** |
| **FIX-07** | Timers & Workers | Replaced volatile in-memory timers with database-driven fields (`expiresAt`, `nextExpansionAt`, `autoOfflineAt`) and interval worker. | **RESOLVED** |
| **FIX-08** | Money Model | Standardized on integer minor units (tiyn, 1 KZT = 100 tiyn) across 3 pricing modes (`fixed`, `diagnostic_fee`, `estimate_range`). | **RESOLVED** |
| **FIX-09** | Telegram Integration | Formalized Telegram Bot as official provider notification and quick-action channel (ADR-010). | **RESOLVED** |
| **FIX-10** | Admin Module | Included minimal operational admin panel directly in MVP scope (verification, live inspector, disputes). | **RESOLVED** |
| **FIX-11** | Concurrency & IDOR | Added `SELECT FOR UPDATE` locking on offer selection, `UNIQUE(request_id, provider_id)`, and resource ownership matrix. | **RESOLVED** |
| **FIX-12** | Business Validation Gate | Corrected premature claims of validation; added explicit Phase 0.5 supply validation gate in development plan. | **RESOLVED** |

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
