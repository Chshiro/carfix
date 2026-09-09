# CARFIX — FIX PLAN

**Date:** 2026-09-09  
**Status:** Pre-Implementation (fixes to architecture & planning documents before coding)

---

## Overview

This document lists all issues found during the v2 audit, prioritized by severity, with concrete actions. These fixes should be applied to the planning documents and architecture BEFORE starting implementation.

---

## P0 — Blocks MVP / Safety / Core Transaction

| # | Issue | Current State | Fix | Document |
|---|-------|--------------|-----|----------|
| P0-1 | No code exists | 0% implemented | Begin Phase 1 implementation after applying document fixes | — |
| P0-2 | No supply validation | Zero providers contacted | Founder calls 20+ auto electricians in Astana within 1 week | MARKETPLACE_AUDIT.md |
| P0-3 | Kolesa.kz competitive blind spot | Not analyzed as repair services competitor | Update competitive positioning to address Kolesa.kz services section | AUDIT.md ✅ Fixed |
| P0-4 | Legal: auto repair requires ИП registration | Not addressed | Add provider ИП verification requirement. Get legal review. | TRUST_SAFETY_AUDIT.md ✅ Documented |
| P0-5 | Trust model too thin (no provider tiers) | Binary verified/unverified | Implement 3-tier provider system (New/Verified Individual/Verified Service) | TRUST_SAFETY_AUDIT.md ✅ Documented |
| P0-6 | Admin panel deferred too late | "Post-validation" | Move admin to Phase 1. Provider verification and order inspection are operational requirements. | DEVELOPMENT_PLAN.md, ARCHITECTURE.md |
| P0-7 | User can't be both motorist and provider | `User.role = ENUM(single value)` | Change to role array or junction table | ARCHITECTURE.md, schema |
| P0-8 | Vehicle required for request creation | `vehicleId: UUID FK NOT NULL` | Make nullable. Vehicle is optional enrichment. | ARCHITECTURE.md, schema |

---

## P1 — Seriously Worsens Core Experience

| # | Issue | Current State | Fix | Document |
|---|-------|--------------|-----|----------|
| P1-1 | Request creation too many steps | 6 steps before publish | Reduce to 2 mandatory (category + location), rest optional | PRODUCT.md, UX_AUDIT.md |
| P1-2 | Dual location storage | lat/lng + PostGIS geography | Use PostGIS geography as single source | ARCHITECTURE.md |
| P1-3 | setTimeout for timers | Lost on server restart | Database-driven timestamps + periodic check | ARCHITECTURE.md |
| P1-4 | No error response format | Not specified | Define `{ error, code, details }` standard | TECHNICAL_AUDIT.md |
| P1-5 | No IDOR prevention pattern | Not addressed | Add ownership verification to every endpoint | TECHNICAL_AUDIT.md |
| P1-6 | No OrderStatusHistory table | Missing | Add table for audit trail | ARCHITECTURE.md |
| P1-7 | No customer acquisition plan | Not addressed | Define channels and sequencing | MARKETPLACE_AUDIT.md |
| P1-8 | Provider UX not designed | Minimal specification | Design glanceable request card and fast offer form | UX_AUDIT.md |
| P1-9 | Missing database indexes | Only GIST index specified | Add 8+ indexes listed in TECHNICAL_AUDIT.md | ARCHITECTURE.md |
| P1-10 | Blind rating not specified | Ratings visible immediately | Both submit before either sees | TRUST_SAFETY_AUDIT.md |
| P1-11 | No dispute flow | Not addressed | Simple report → admin email | TRUST_SAFETY_AUDIT.md |
| P1-12 | Safety-critical categories unrestricted | Any provider can offer any service | Category access tied to provider verification level | TRUST_SAFETY_AUDIT.md |

---

## P2 — Important But Can Wait

| # | Issue | Current State | Fix | Document |
|---|-------|--------------|-----|----------|
| P2-1 | Service type forced selection | 3-option selection during request creation | Default to `PROVIDER_COMES` for emergency categories | PRODUCT.md |
| P2-2 | No SSE event deduplication | Not addressed | Include eventId in every SSE event | TECHNICAL_AUDIT.md |
| P2-3 | No SSE event ordering | Not addressed | Include sequence number in SSE events | TECHNICAL_AUDIT.md |
| P2-4 | No offline/degraded behavior | Not specified | Fetch state via REST on reconnect | TECHNICAL_AUDIT.md |
| P2-5 | Offer pricing breakdown | Single `price` field | For now acceptable, but plan for price components | PRODUCT.md |
| P2-6 | Supply types too narrow | Only mobile electricians/mechanics | Architecture supports all types, but document broader supply strategy | AUDIT.md |
| P2-7 | No wireframes | No visual design | Create wireframes for 8 key screens | UX_AUDIT.md |
| P2-8 | No Telegram notification channel | Only push + SMS | Add Telegram bot as notification option for providers | MARKETPLACE_AUDIT.md |
| P2-9 | Refresh token rotation | Not specified | Invalidate old refresh token when new one issued | TECHNICAL_AUDIT.md |
| P2-10 | Photo EXIF stripping | Not addressed | Strip EXIF data (may contain GPS) from uploaded photos | TECHNICAL_AUDIT.md |
| P2-11 | Provider auto-offline notification | Provider goes offline silently | Prompt: "Вы давно неактивны. Переключить в оффлайн?" | UX_AUDIT.md |
| P2-12 | No idempotency specification | Not addressed | Define idempotency approach for critical operations | TECHNICAL_AUDIT.md |

---

## P3 — Nice-to-Have

| # | Issue | Current State | Fix | Document |
|---|-------|--------------|-----|----------|
| P3-1 | No referral mechanism | Not planned | Consider provider referral program | MARKETPLACE_AUDIT.md |
| P3-2 | No GService.kz competitive analysis | Not mentioned | Research GService.kz positioning | AUDIT.md |
| P3-3 | No onboarding tutorial | Not planned | Simple 3-slide onboarding on first launch | UX_AUDIT.md |
| P3-4 | Language inconsistency in docs | Mix of English/Russian | Standardize to English for docs, Russian for user-facing strings | — |
| P3-5 | No AdminAction audit table | Not in schema | Add simple admin action log | ARCHITECTURE.md |
| P3-6 | ADR for SSE revisit trigger | Only mentioned informally | Add ADR-010 with specific SSE→WebSocket trigger conditions | DECISIONS.md |

---

## Document Updates Required

### Before Implementation

| Document | Updates Needed |
|----------|---------------|
| [ARCHITECTURE.md](file:///c:/carfix/ARCHITECTURE.md) | Fix User.role model, make vehicleId nullable, consolidate PostGIS location, add OrderStatusHistory, add indexes, replace setTimeout with DB checks, add admin to Phase 1 |
| [PRODUCT.md](file:///c:/carfix/PRODUCT.md) | Simplify request creation flow (2 taps), add admin journey, add provider tier system reference |
| [DEVELOPMENT_PLAN.md](file:///c:/carfix/DEVELOPMENT_PLAN.md) | Move admin from "Post-validation" to Phase 1, add provider tiers, update Phase 1 deliverables |
| [DECISIONS.md](file:///c:/carfix/DECISIONS.md) | Add ADR-010 (SSE revisit conditions), ADR-011 (provider tier system), update ADR-001 (admin is Phase 1) |

### New Documents Created

| Document | Purpose |
|----------|---------|
| [AUDIT.md](file:///c:/carfix/AUDIT.md) | ✅ Full project audit v2 (rewritten) |
| [PRODUCT_AUDIT.md](file:///c:/carfix/PRODUCT_AUDIT.md) | ✅ Product-specific audit |
| [TECHNICAL_AUDIT.md](file:///c:/carfix/TECHNICAL_AUDIT.md) | ✅ Technical architecture audit |
| [ARCHITECTURE_AUDIT.md](file:///c:/carfix/ARCHITECTURE_AUDIT.md) | ✅ Architecture component analysis |
| [MARKETPLACE_AUDIT.md](file:///c:/carfix/MARKETPLACE_AUDIT.md) | ✅ Marketplace-specific audit |
| [UX_AUDIT.md](file:///c:/carfix/UX_AUDIT.md) | ✅ UX audit |
| [TRUST_SAFETY_AUDIT.md](file:///c:/carfix/TRUST_SAFETY_AUDIT.md) | ✅ Trust & safety audit |
| [MVP_SCOPE.md](file:///c:/carfix/MVP_SCOPE.md) | ✅ Final MVP scope |
| [FIX_PLAN.md](file:///c:/carfix/FIX_PLAN.md) | ✅ This document |

---

## Implementation Order

After applying document fixes, begin implementation in this order:

```
1. Initialize project (Next.js + TypeScript + Docker Compose)
2. Database schema (ALL tables, including provider tiers + OrderStatusHistory)
3. Auth (phone + OTP + JWT)
4. Provider profile + specializations + availability
5. Request creation (simplified: category + location only, rest optional)
6. Matching engine (PostGIS query)
7. SSE infrastructure
8. Notifications (push + in-app)
9. Offers (creation + comparison view)
10. Order lifecycle (full state machine)
11. Rating system (blind rating)
12. Admin panel (basic operations)
13. E2E test scenario
14. Deploy to production
```

Each step should be testable independently. Do not proceed to step N+1 until step N works end-to-end.
