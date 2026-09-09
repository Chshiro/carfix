# CARFIX — DEVELOPMENT PLAN (OPTIMIZED VERTICAL-SLICE)

**Version:** 2.0  
**Date:** 2026-09-09  
**Strategy:** Feature-Driven Vertical Slices (End-to-End Core Loop first)  
**Target Duration:** 8 Weeks (Launch-Ready MVP in Astana, Kazakhstan)

---

## Executive Overview

This plan breaks the MVP into **5 Vertical Slices (8 Weeks)**. Unlike traditional horizontal slicing (where the database is built first, then all APIs, then all UI months later), each vertical slice delivers a functional, end-to-end testable capability.

**The Golden Rule:** The Core Transaction Loop (`Request -> PostGIS Matching -> Offer -> Selection -> Order -> Rating`) is completed, tested, and verified at the database and API level by **Week 2**, ensuring zero architectural surprises later.

---

## Roadmap Overview

```
[WEEK 1-2] SLICE 1: TRANSACTION ENGINE (API + PostGIS + Drizzle + E2E Tests)
[WEEK 3-4] SLICE 2: CUSTOMER JOURNEY (PWA Mobile-First Web App)
[WEEK 5-6] SLICE 3: PROVIDER JOURNEY & TELEGRAM BOT INTEGRATION
[WEEK 7]   SLICE 4: TRUST, SAFETY & ADMIN MODERATION PANEL
[WEEK 8]   SLICE 5: E2E FIELD TESTING, POLISH & ASTANA PILOT ONBOARDING
```

---

## Slice 1 (Weeks 1–2) — Transaction Engine & Backend Core

**Goal:** Fully functioning, type-safe API and PostgreSQL/PostGIS database with complete transaction lifecycle and automated E2E tests.

### Deliverables

| Task | Description |
|------|-------------|
| **Monorepo Setup** | Node.js + TypeScript (strict), Fastify/Next.js, Drizzle ORM, Zod, ESLint |
| **Docker Compose** | PostgreSQL 16 + PostGIS extension container for local development |
| **Database Schema** | Complete Drizzle schema: `users`, `providers`, `vehicles`, `service_requests`, `offers`, `orders`, `reviews`, `notifications`, `audit_logs` |
| **Auth & Security** | Phone OTP (Mock for dev / real SMS ready), JWT (Access + Refresh tokens), role guards |
| **Spatial Matching Engine** | PostGIS `ST_DWithin` spatial query to find online providers within radius (5–10 km) in Astana |
| **Offer Engine** | 3 pricing modes (`fixed`, `diagnostic_fee`, `estimate_range`), unique offer constraint per provider |
| **Order State Machine** | Atomic offer selection (`SELECT FOR UPDATE`), transition guards (`PUBLISHED` → `OFFERS_RECEIVED` → `PROVIDER_SELECTED` → `IN_PROGRESS` → `COMPLETED` / `CANCELLED`) |
| **Privacy Layer** | Customer exact location and phone masked until provider selection is confirmed |
| **E2E Integration Test Suite** | Automated script validating the full request-to-review lifecycle against real PostgreSQL database |

### Exit Criteria
- `docker compose up -d` brings up PostgreSQL + PostGIS.
- Drizzle migrations execute with 0 errors.
- Automated E2E integration test completes all 6 lifecycle stages.
- Concurrency test passes: double selection of different offers on the same request is atomically rejected.

---

## Slice 2 (Weeks 3–4) — Customer Journey (Mobile-First PWA)

**Goal:** A car owner in Astana can create a request in 2 minutes, preview incoming offers in real-time, select a master, track progress, and rate the job.

### Deliverables

| Task | Description |
|------|-------------|
| **Customer Shell** | Mobile-first responsive layout (PWA manifest, dark/light theme, clean automotive aesthetics) |
| **Phone Auth UI** | Fast phone number entry + SMS OTP input with auto-focus and countdown timer |
| **2-Step Request Wizard** | Step 1: Category picker (5 launch categories) + Vehicle + Description + Photo upload (client canvas compression). Step 2: Location picker (GPS auto-detection + map pin) |
| **Realtime Offer Feed** | Live offer comparison screen (SSE / polling): Provider photo, rating, price model, ETA, distance |
| **Provider Profile Modal** | View full provider details, verification badge, and past customer reviews before selecting |
| **Active Order Tracker** | Real-time status tracker (En Route → Arrived → In Progress → Completed) with direct Call / WhatsApp buttons |
| **Completion & Rating Screen** | 1–5 star rating + review text + price confirmation |
| **Vehicle Garage** | Save vehicle profile (Make, Model, Year) for instant reuse |

### Exit Criteria
- Customer can complete full request creation on mobile Safari & Chrome in < 90 seconds.
- Image uploads compress to < 500KB and upload reliably.
- Real-time offers update automatically without manual page refresh.

---

## Slice 3 (Weeks 5–6) — Provider Journey & Telegram Bot

**Goal:** Auto electricians and mechanics can register, go online, receive instant Telegram alerts for nearby requests, submit bids, and manage orders.

### Deliverables

| Task | Description |
|------|-------------|
| **Provider Onboarding UI** | Profile setup, business type (Independent Master / СТО), specialization selection (5 categories), document upload |
| **Availability & Geolocation** | One-tap Online/Offline toggle with GPS capture and staleness auto-expiry (15 min) |
| **Telegram Bot Integration** | Bot webhook linking provider account; instant alert with inline buttons when request matches radius |
| **Quick-Bidding System** | Submit offer in 3 taps from Telegram or Web (`[5,000 ₸ Diagnostic]` / `[Custom Price]` + ETA) |
| **Provider Active Order View** | Order execution screen with status buttons: `[Выехал]` → `[На месте]` → `[Начал работу]` → `[Завершил]` |
| **Earnings & Job History** | Summary of completed orders, ratings received, and response metrics |

### Exit Criteria
- Provider receives Telegram alert within 3 seconds of request publication.
- Provider can submit an offer directly from Telegram or mobile web.
- State changes update the customer's screen immediately.

---

## Slice 4 (Week 7) — Trust, Safety & Admin Moderation Panel

**Goal:** Operations team has full control over provider verification, safety-critical filtering, dispute resolution, and marketplace health metrics.

### Deliverables

| Task | Description |
|------|-------------|
| **Admin Authentication** | Secure admin role authentication and audit logging for all moderation actions |
| **Provider Verification Queue** | Review submitted documents (ИП, certificates, ID) and assign levels: `Level 1: Verified Service`, `Level 2: Verified Master`, `Level 3: New Provider` |
| **Safety-Critical Category Gate** | Enforce restriction: unverified new providers cannot accept safety-critical jobs |
| **Request & Order Inspector** | View all live requests, active orders, and cancellation reasons across Astana |
| **Dispute & Report Management** | Interface to resolve customer/provider price disputes or bad behavior |
| **Marketplace Health Dashboard** | Real-time tracking: Active Online Providers, Time to First Offer, Fulfillment Rate |

### Exit Criteria
- Admin can approve/reject provider documents and change trust levels.
- Safety-critical categories are blocked for New Providers.
- Dashboard accurately displays real-time marketplace metrics.

---

## Slice 5 (Week 8) — Hardening, Polish & Astana Pilot Onboarding

**Goal:** Production deployment, edge-case hardening, field testing in Astana, and onboarding the first 15–20 real providers.

### Deliverables

| Task | Description |
|------|-------------|
| **Production Environment Setup** | Cloud VPS / Server deployment (Docker Compose, HTTPS/SSL, PostgreSQL backup schedule) |
| **Network Resilience & PWA** | Offline handling, graceful reconnect on dropped mobile connection |
| **Security Audit & Rate Limiting** | Strict IP and phone rate limits, IDOR protection on all order/offer endpoints |
| **Astana Provider Onboarding** | Personal onboarding of 15–20 auto electricians and mechanics in Esil/Almaty districts |
| **Closed Pilot Execution** | First 10–20 live test orders executed on Astana streets |

### Exit Criteria
- E2E smoke tests pass on production infrastructure.
- At least 15 verified providers connected to Telegram bot and active in target districts.
- First live customer request receives a real provider offer in < 5 minutes.

---

## End-to-End Test Matrix

| # | Test Scenario | Expected Outcome | Verification |
|---|---------------|------------------|--------------|
| 1 | Standard Flow | Request → 3 Offers → Select → Order → Complete → 5-Star Review | Automated E2E + Manual |
| 2 | PostGIS Spatial Radius | Request at (51.128, 71.430) notifies providers at 2km, ignores providers at 25km | Integration Test |
| 3 | Concurrency Protection | 2 simultaneous offer selections on 1 request → 1 succeeds, 1 gets 409 Conflict | Concurrency Test |
| 4 | Privacy Protection | Provider cannot read customer phone or exact coordinates until selected | API Security Test |
| 5 | Timeout & Auto-Offline | Inactive provider (> 4 hours without GPS update) excluded from matching | Unit / Cron Test |
| 6 | New Provider Safety Gate | Level 3 provider cannot bid on safety-critical categories | RBAC Test |
