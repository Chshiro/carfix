# CarFix — On-Demand Automotive Assistance Marketplace
**Target Market:** Astana, Kazakhstan (Pilot: Esil & Almaty Districts)  
**Status:** `Pre-MVP — Product & Architecture Defined` | `Supply Validation In Progress`

---

## Overview

CarFix is an on-demand automotive assistance marketplace connecting stranded car owners with verified nearby auto specialists (auto electricians, mobile mechanics, battery specialists) in real-time.

Instead of calling dozens of repair shops in directories (2GIS/OLX) or posting in unstructured WhatsApp groups, a motorist submits a request in 2 steps and receives transparent price bids from qualified specialists nearby.

---

## Canonical Tech Stack

- **Application Architecture:** Single Next.js Application (App Router, API Route Handlers, Modular Domain Services, Mobile-First PWA)
- **Language:** TypeScript (`strict` mode)
- **Database:** PostgreSQL 16 with **PostGIS** extension (`geography(Point, 4326)`)
- **Data Access:** Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
- **Real-Time Client Updates:** Server-Sent Events (SSE) with REST state synchronization
- **Provider Dispatch & Bidding:** Telegram Bot API (@CarFixPartnerBot) with 1-tap inline keyboards
- **Storage:** S3-compatible object storage (Cloudflare R2 / AWS S3) with pre-signed upload URLs

---

## Canonical MVP Categories (Strictly 3)

1. `electrical_starting` — Автоэлектрика и компьютерная диагностика
2. `battery_jumpstart` — Прикурка аккумулятора (12V/24V) и замена АКБ на месте
3. `mobile_mechanic` — Мелкий выездной ремонт на дороге

*(Шиномонтаж, эвакуаторы и сложный стационарный ремонт запланированы на Post-MVP фазу).*

---

## Repository Documentation Index

| Document | Purpose |
|---|---|
| [DEVELOPMENT_PLAN.md](file:///c:/carfix/DEVELOPMENT_PLAN.md) | Canonical 8-week vertical-slice implementation plan and 22-scenario test matrix |
| [ARCHITECTURE.md](file:///c:/carfix/ARCHITECTURE.md) | Complete system architecture, domain models, 12-state order machine, Anti-IDOR matrix, and error contracts |
| [MVP_SCOPE.md](file:///c:/carfix/MVP_SCOPE.md) | Frozen MVP scope boundaries, in-scope/out-of-scope feature list, and launch kill-thresholds |
| [PRODUCT.md](file:///c:/carfix/PRODUCT.md) | Product context, problem statement, user journeys, and tiyn money representation |
| [DECISIONS.md](file:///c:/carfix/DECISIONS.md) | Architectural Decision Records (ADR-001 through ADR-015) |
| [FIX_PLAN.md](file:///c:/carfix/FIX_PLAN.md) | Log of resolved P0 specification inconsistencies and P1/P2 backlog |
| [IMPLEMENTATION_READINESS.md](file:///c:/carfix/IMPLEMENTATION_READINESS.md) | Final pre-implementation audit and readiness verdict |

---

## Current Status & Next Steps

All product specifications and architectural decisions are consolidated and frozen. Development begins with **Slice 1: Domain + Transaction Core** (Database schema, PostGIS spatial queries, and automated integration tests).
