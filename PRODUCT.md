# CARFIX — CANONICAL PRODUCT SPECIFICATION

**Version:** 2.0 (Canonical Consistency Pass)  
**Date:** 2026-09-09  
**Status:** Canonical & Implementation-Ready  
**Market:** Astana, Kazakhstan (Target Pilot: Esil & Almaty Districts)

---

## 1. Product Context & Positioning

CarFix is an **on-demand automotive assistance marketplace**.

The user does not think: *"I need to search for an auto repair shop directory."*  
The user thinks: **"My car broke down right now. I need someone qualified to solve it."**

CarFix transforms an emergency or roadside problem into structured requests, matches eligible nearby specialists in real-time, and enables transparent price bidding and order completion.

### The Core Marketplace Loop
```
Emergency Breakdown (Car won't start)
        ↓
Customer Creates Request (2-step: Category + GPS Location)
        ↓
System Matches Eligible Nearby Providers (PostGIS ST_DWithin)
        ↓
Providers Receive Instant Alerts (Web + Telegram Bot)
        ↓
Providers Submit Offers (Fixed, Diagnostic Fee, or Range)
        ↓
Customer Compares Offers & Selects Master
        ↓
Order Confirmed (Direct Phone/WhatsApp Unlocked)
        ↓
Provider Arrives & Performs Service
        ↓
Completion & 1–5 Star Rating
```

---

## 2. Canonical Launch Categories (Strictly 3)

1. **`electrical_starting` (Автоэлектрика и запуск):** Computer diagnostics, battery drain, starter, alternator, wiring issues.
2. **`battery_jumpstart` (Аккумулятор и прикурка):** Jumpstarting dead battery (12V/24V), delivery/installation of new battery, terminal maintenance.
3. **`mobile_mechanic` (Мелкий выездной ремонт):** Belt replacement, hose fixes, spark plugs, minor mechanical repairs on the road.

*(Tire fitting and towing are deferred post-MVP to maximize supply density on electrical/breakdown emergency services).*

---

## 3. User & Provider Models

### 3.1 Multi-Role User Accounts
- Users authenticate via phone number and SMS OTP.
- Accounts support multiple roles: `roles = ['motorist']`, `['motorist', 'provider']`, `['admin']`.
- Admin role is protected and can only be assigned by existing administrators or database seed.

### 3.2 Vehicle Management (Optional on Request)
- Customers can save cars in their "Garage" (`make`, `model`, `year`, `license_plate`).
- **Critical MVP Rule:** Vehicle is **optional** on `ServiceRequest`. In an urgent situation, a customer can submit a request with just category and GPS location.

### 3.3 Provider Capability & Verification
- Decoupled model: `ProviderProfile` + `ProviderType` (`STO`, `INDEPENDENT_MASTER`, `MOBILE_MASTER`) + `ProviderCapability` (`BATTERY`, `AUTO_ELECTRIC`, `DIAGNOSTICS`, `MECHANICAL_MINOR`) + `ProviderAvailability` (Online toggle with GPS and auto-offline timeout).
- 3 Verification Levels:
  - `LEVEL_1_VERIFIED_SERVICE` (Registered auto service / СТО)
  - `LEVEL_2_VERIFIED_MASTER` (Verified independent technician with verified ID/ИП)
  - `LEVEL_3_NEW_PROVIDER` (Unverified new provider, restricted categories)

---

## 4. Pricing Structure (Integer Minor Units — Tiyn)

All monetary values are stored in tiyn (1 KZT = 100 tiyn):
1. **Fixed Price (`fixed`):** Stored as `amount_tiyn`. For standardized tasks.
2. **Diagnostic Fee (`diagnostic_fee`):** Stored as `amount_tiyn`. Covers callout + fault isolation. Final repair cost is recorded at completion.
3. **Estimate Range (`estimate_range`):** Stored as `min_amount_tiyn` and `max_amount_tiyn`.

---

## 5. Canonical Order State Machine

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

---

## 6. Real-Time & Telegram Channel

- **Customer Real-time:** Server-Sent Events (SSE) stream incoming offers in real-time. If connection drops, REST fallback fetches full state.
- **Provider Telegram Bot:** Providers receive instant lead alerts in Telegram (@CarFixPartnerBot) with 1-tap bidding buttons. Webhook actions are guarded with idempotency.

---

## 7. Operations & Administration (MVP Scope)

The admin panel provides:
- Provider document verification queue.
- Live inspection of all requests and orders across Astana.
- Dispute arbitration between customer and provider.
- User/Provider suspension with immutable audit logs.
