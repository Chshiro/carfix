# CarFix — On-Demand Automotive Assistance Marketplace
**Target Market:** Astana, Kazakhstan (Pilot: Esil & Almaty Districts)  
**Status:** `Slice 1: Hardened & Verified` | `Ready for Slice 2`

---

## Overview

CarFix is an on-demand automotive assistance marketplace connecting stranded car owners with verified nearby auto specialists (auto electricians, mobile mechanics, battery specialists) in real-time.

Instead of calling dozens of repair shops in directories (2GIS/OLX) or posting in unstructured WhatsApp groups, a motorist submits a request in 2 steps and receives transparent price bids from qualified specialists nearby.

---

## Tech Stack

- **Application Architecture:** Next.js Application (App Router, API Route Handlers, Modular Monolith Domain Services)
- **Language:** TypeScript (`strict` mode)
- **Database:** PostgreSQL 16 with **PostGIS** extension (`geography(Point, 4326)`)
- **Data Access:** Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
- **Testing:** Vitest with PostgreSQL/PostGIS integration test suite
- **Authentication:** JWT Bearer tokens with server-side authoritative database resolution

---

## Quick Start & Verification

```bash
# 1. Start PostgreSQL with PostGIS
docker compose up -d

# 2. Run automated test environment setup & test suite
npm run test:fresh

# 3. Full verification (Typecheck, Lint, Tests, Build)
npm run verify
```

---

## Documentation

All project documentation is consolidated in the [`/docs`](file:///c:/carfix/docs/README.md) directory:

- [Documentation Index](file:///c:/carfix/docs/README.md)
- [Architecture Documentation](file:///c:/carfix/docs/ARCHITECTURE.md)
- [Development Plan](file:///c:/carfix/docs/DEVELOPMENT_PLAN.md)
- [Architectural Decisions (ADR)](file:///c:/carfix/docs/DECISIONS.md)
- [Product Specifications](file:///c:/carfix/docs/PRODUCT.md)
- [MVP Scope](file:///c:/carfix/docs/MVP_SCOPE.md)
- [Manual QA Guide & Scenarios](file:///c:/carfix/docs/MANUAL_QA.md)
- [Implementation Readiness](file:///c:/carfix/docs/IMPLEMENTATION_READINESS.md)
- [Security & Trust Audit](file:///c:/carfix/docs/TRUST_SAFETY_AUDIT.md)
