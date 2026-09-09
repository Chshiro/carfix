# CARFIX — ARCHITECTURAL DECISIONS

**Status:** Living document. Updated as decisions are made.

---

## ADR-001: Single Next.js Application (No Monorepo)

**Date:** 2026-09-09  
**Status:** Accepted

### Context
The original concept suggested web, desktop, and mobile platforms, which would imply a monorepo with shared packages. After audit, the MVP is a single responsive web application.

### Alternatives Considered
1. **Monorepo (Turborepo/Nx)** with `apps/web`, `apps/api`, `packages/shared-types`
2. **Separate repositories** for frontend and backend
3. **Single Next.js project** with API routes

### Decision
Single Next.js project. API routes serve as the backend. No monorepo tooling.

### Rationale
- Only one deployable artifact exists (the web app)
- Next.js API routes eliminate the need for a separate backend server for MVP
- Shared types are achieved via importing from `src/types/` — no package boundary needed
- Monorepo tooling (Turborepo, Nx) adds configuration overhead for zero benefit with one app
- If a separate backend becomes necessary later, the domain logic in `src/domain/` is framework-agnostic and can be extracted

### Consequences
- (+) Simpler project setup and maintenance
- (+) Faster development velocity
- (+) Single deployment
- (-) API routes have limitations (no WebSocket support natively, cold starts on serverless)
- (-) If we later need a separate backend, migration requires work

### Reversal Conditions
Split into monorepo if: (a) native mobile app is built, OR (b) API route limitations become blocking, OR (c) a second developer joins and needs backend isolation.

---

## ADR-002: SSE Over WebSockets for Real-Time

**Date:** 2026-09-09  
**Status:** Accepted

### Context
The marketplace requires real-time updates: new offers appearing for customers, new requests appearing for providers. The two main options are WebSockets and Server-Sent Events (SSE).

### Alternatives Considered
1. **WebSockets (via Socket.io or ws)** — full-duplex communication
2. **Server-Sent Events (SSE)** — server-to-client only
3. **Long polling** — simple but high overhead
4. **Third-party service (Pusher, Ably)** — managed but adds dependency and cost

### Decision
Server-Sent Events (SSE) with polling fallback.

### Rationale
- Our real-time needs are **unidirectional** (server → client): "here's a new offer" / "here's a new request"
- Client → server communication uses normal HTTP POST (submit offer, accept offer, etc.)
- SSE has built-in reconnection (EventSource API)
- SSE works through HTTP proxies and CDNs without special configuration
- WebSockets require connection management, heartbeats, and special proxy config
- SSE is simpler to implement in Next.js API routes
- Single-server deployment means no pub/sub complexity

### Consequences
- (+) Much simpler implementation
- (+) Works through proxies and load balancers without configuration
- (+) Built-in reconnection in browser
- (-) One-directional only (not a problem for our use case)
- (-) Not supported in very old browsers (irrelevant — our target audience uses modern phones)
- (-) If we scale to multiple app servers, need a pub/sub mechanism (Redis) to fan out events

### Reversal Conditions
Switch to WebSockets if: (a) bidirectional real-time communication is needed (e.g., live chat), OR (b) SSE connection limits become a bottleneck.

---

## ADR-003: PostgreSQL + PostGIS for Geospatial

**Date:** 2026-09-09  
**Status:** Accepted

### Context
The marketplace needs to find providers within a radius of a customer's location. This requires geospatial queries with acceptable performance.

### Alternatives Considered
1. **PostgreSQL + PostGIS** — native geospatial extension
2. **PostgreSQL with raw lat/lng + Haversine in SQL** — no extension needed
3. **Separate geospatial service (Elasticsearch, Redis with geospatial)** — dedicated geo engine
4. **Application-level distance calculation** — fetch all providers, filter in code

### Decision
PostgreSQL + PostGIS.

### Rationale
- PostGIS `ST_DWithin` uses spatial indexes (GIST) for O(log n) radius queries
- Haversine in SQL works but requires full table scan (no index)
- At 100-500 providers, Haversine is fine. At 5000+ providers, PostGIS is necessary. Starting with PostGIS avoids a migration.
- PostGIS is a single `CREATE EXTENSION` — zero infrastructure addition
- Eliminates need for a separate geospatial service

### Consequences
- (+) Fast geospatial queries at any scale
- (+) No separate service to maintain
- (+) Industry standard, well-documented
- (-) PostGIS adds ~5MB to Docker image
- (-) Slightly more complex schema (geography columns)

---

## ADR-004: Drizzle ORM Over Prisma

**Date:** 2026-09-09  
**Status:** Accepted

### Context
Need a type-safe database access layer for TypeScript + PostgreSQL.

### Alternatives Considered
1. **Prisma** — most popular TypeScript ORM
2. **Drizzle** — SQL-like TypeScript ORM
3. **Raw SQL (pg driver)** — maximum control
4. **Kysely** — SQL query builder

### Decision
Drizzle ORM.

### Rationale
- SQL-like API — what you write is close to what executes. No "query engine" magic.
- Better PostGIS support than Prisma (can use raw SQL fragments)
- Lighter weight than Prisma (no binary engine)
- Schema-as-code with type inference — types are derived from schema, not generated
- Migration system is simple and predictable
- Better performance than Prisma for complex queries

### Consequences
- (+) SQL knowledge translates directly
- (+) No heavy binary dependencies
- (+) Better raw SQL escape hatch for PostGIS queries
- (-) Smaller community than Prisma
- (-) Less automatic tooling (no Prisma Studio equivalent)
- (-) Less documentation for edge cases

---

## ADR-005: 2GIS Maps API (Primary) with OpenStreetMap Fallback

**Date:** 2026-09-09  
**Status:** Proposed (pending API key evaluation)

### Context
The application needs map display and reverse geocoding for Kazakhstan (specifically Astana).

### Alternatives Considered
1. **Google Maps** — global standard
2. **Yandex Maps** — popular in CIS region
3. **2GIS Maps API** — local provider, excellent Kazakhstan coverage
4. **OpenStreetMap (Leaflet)** — open-source, free

### Decision
Evaluate 2GIS Maps API first. Use Leaflet/OpenStreetMap as fallback if 2GIS API is not cost-effective or has insufficient API capabilities.

### Rationale
- 2GIS has the best address database for Kazakhstan cities
- Free tier may be sufficient for MVP
- Users in Kazakhstan are familiar with 2GIS
- Google Maps is expensive and has billing complexity
- Yandex Maps has geopolitical uncertainty
- OpenStreetMap is free but may have less detailed Kazakhstan coverage

### Consequences
- (+) Best local address data
- (+) Users recognize the map style
- (-) Vendor lock-in to a smaller provider
- (-) API may be less mature than Google/Yandex

---

## ADR-006: PWA Instead of Native Mobile Apps

**Date:** 2026-09-09  
**Status:** Accepted

### Context
Both motorists and providers will primarily use the product on mobile phones. The question is whether to build native apps or use a Progressive Web App.

### Alternatives Considered
1. **Native iOS + Android (React Native or Flutter)** — native experience
2. **Progressive Web App (PWA)** — web-based, installable
3. **Hybrid (Capacitor/Ionic)** — web code in native shell

### Decision
PWA first. Native apps only if PWA limitations become measurable business problems.

### Rationale
- Single codebase (the Next.js web app IS the mobile experience)
- No App Store review process — instant updates
- No installation friction — works via URL
- PWA supports push notifications, offline shell, install prompt
- 2-3x faster development than native for a solo developer
- Marketplace hypothesis must be validated before investing in native
- Kazakhstan has good mobile browser support (Chrome dominates)

### Known Limitations
- iOS Safari has limited PWA push notification support (improved in iOS 16.4+)
- No access to some native APIs (NFC, Bluetooth — not needed)
- Less smooth animations than native (acceptable for MVP)

### Reversal Conditions
Build native if: (a) PWA push notifications prove unreliable in production AND (b) the marketplace is validated AND (c) budget/team allows native development.

---

## ADR-007: Free Marketplace Model for MVP (No Monetization)

**Date:** 2026-09-09  
**Status:** Accepted

### Context
The business model analysis identified multiple revenue options. The question is when to start charging.

### Decision
MVP is completely free for both motorists and providers. No commission, no subscription, no paid leads.

### Rationale
- The existential risk is marketplace liquidity, not revenue
- Charging providers creates supply acquisition friction during the hardest phase
- Every barrier to provider signup reduces the chance of achieving marketplace density
- Charging customers would destroy demand when alternatives (2GIS, WhatsApp) are free
- Unit economics can be measured without actual revenue collection (track GMV via recorded offer prices)

### Planned Monetization Path
1. **Month 6-12:** Paid leads (provider pays small fee to respond to a request)
2. **Month 12+:** Transaction commission (requires in-app payments)

### Consequences
- (+) Maximum supply/demand acquisition speed
- (+) Simple architecture (no payment infrastructure)
- (-) No revenue during validation period
- (-) Must have sufficient funding to operate for 6-12 months without revenue

---

## ADR-008: Russian-Only MVP (No Multi-Language)

**Date:** 2026-09-09  
**Status:** Accepted

### Context
Kazakhstan is officially bilingual (Kazakh + Russian). English is used in business contexts. The question is which languages to support at launch.

### Decision
Russian only for MVP. All strings externalized for future localization.

### Rationale
- Russian is the dominant digital services language in Astana
- All major marketplace apps in Kazakhstan (inDrive, Kaspi, 2GIS) default to Russian
- Adding Kazakh or English multiplies content/QA work
- Externalized strings make future localization a content task, not an engineering task

### Consequences
- (+) Faster development
- (+) Simpler QA
- (-) May alienate Kazakh-only speakers (small percentage in Astana)
- (-) Not suitable for international investor demos without English

---

## ADR-009: No In-App Payments for MVP

**Date:** 2026-09-09  
**Status:** Accepted

### Context
Payment after service completion could happen via the platform or off-platform.

### Decision
No in-app payments. Customers pay providers directly (cash, Kaspi transfer, bank card on-site).

### Rationale
- Payment infrastructure (Kaspi Pay, Stripe equivalent for KZ) adds massive complexity
- Payment disputes, refunds, and escrow require legal framework
- Kaspi transfer is ubiquitous in Kazakhstan — users already know how to pay
- The marketplace hypothesis can be validated without controlling the payment
- Offer prices are recorded in the system for analytics and trust (even without payment flow)

### Consequences
- (+) Much simpler architecture
- (+) No payment processing fees
- (+) No financial regulatory requirements
- (-) Cannot enforce exact pricing
- (-) Cannot take commission automatically
- (-) Less data on actual transaction values (rely on self-reported completion)
- (-) Off-platform payment makes disintermediation easier

### Reversal Conditions
Add payments when: (a) marketplace is validated, (b) commission model is activated, (c) Kaspi Pay or equivalent integration is justified by revenue.
