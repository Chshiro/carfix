# CARFIX — ARCHITECTURE AUDIT

**Date:** 2026-09-09  
**Status:** Pre-Implementation

---

## Component Analysis

For each major architectural component, evaluating: necessity, current complexity, MVP requirement, and recommended action.

---

| Component | Purpose | Current Complexity | Actual MVP Need | Action | Reason |
|-----------|---------|-------------------|----------------|--------|--------|
| **Next.js (App Router)** | Full-stack framework | Medium | ✅ Required | **Keep** | Correct choice for solo developer. SSR for landing page. API routes for backend. |
| **PostgreSQL 16** | Primary database | Low | ✅ Required | **Keep** | Industry standard. Single database for everything. |
| **PostGIS** | Geospatial queries | Low | ✅ Required | **Keep** | `ST_DWithin` for radius matching. Single `CREATE EXTENSION`. No additional infrastructure. |
| **Drizzle ORM** | Database access | Low | ✅ Required | **Keep** | SQL-like API. Good PostGIS escape hatch. Schema-driven types. |
| **SSE (Server-Sent Events)** | Real-time updates | Low | ✅ Required (or WebSocket) | **Keep (with caveat)** | Simpler than WebSocket. But evaluate WebSocket if deploying to serverless. |
| **JWT Authentication** | Auth tokens | Low | ✅ Required | **Keep** | Standard approach. Access + refresh tokens. |
| **SMS OTP** | Phone verification | Low | ✅ Required | **Keep** | Standard for KZ marketplace apps. Mock for dev. |
| **S3-compatible storage** | Image uploads | Low | ✅ Required | **Keep** | MinIO for dev. S3-compatible for prod. |
| **Docker Compose** | Local dev environment | Low | ✅ Required | **Keep** | PostgreSQL + PostGIS + MinIO in one command. |
| **CSS Modules** | Styling | Low | ✅ Required | **Keep** | Simple, scoped, no runtime overhead. |
| **Zod** | Input validation | Low | ✅ Required | **Keep** | Type-safe validation. Shared between client and server. |
| **next-pwa** | PWA support | Low | ✅ Required | **Keep** | Install prompt, service worker, offline shell. |
| **Pino** | Logging | Low | ✅ Required | **Keep** | Structured JSON logging. |
| **Sentry** | Error tracking | Low | Should have | **Keep** | Free tier. Essential for production debugging. |
| **2GIS Maps API** | Map display | Low-Medium | ✅ Required (or OSM) | **Evaluate** | Check API availability and free tier. OSM/Leaflet as fallback. |
| **Redis** | Caching / pub-sub | N/A | ❌ Not required | **Do not add** | No caching needed at <1000 users. SSE pub/sub not needed on single server. |
| **BullMQ / job queues** | Background jobs | N/A | ❌ Not required | **Do not add** | `setTimeout` + cron checks sufficient. |
| **GraphQL** | API query language | N/A | ❌ Not required | **Do not add** | REST with well-defined endpoints is simpler. |
| **tRPC** | Type-safe RPC | N/A | ❌ Not required | **Do not add** | Next.js API routes + shared types achieve similar type safety. |
| **Socket.IO** | WebSocket | N/A | ❌ Not required (SSE chosen) | **Do not add yet** | Re-evaluate if SSE proves problematic. |
| **Turborepo / Nx** | Monorepo tooling | N/A | ❌ Not required | **Do not add** | Single deployable. No monorepo. |
| **NestJS / Fastify** | Separate backend | N/A | ❌ Not required for MVP | **Do not add yet** | Next.js API routes sufficient for MVP. Evaluate if routes become limiting. |

---

## Comparison: User Preference vs. Current Architecture

The user's prompt suggests a different stack from what was chosen:

| Aspect | User Preference | Current Architecture | Assessment |
|--------|----------------|---------------------|-----------|
| Backend | NestJS or Fastify | Next.js API Routes | Current is simpler for solo developer MVP. NestJS/Fastify better for team development. |
| Realtime | WebSocket / Socket.IO | SSE | SSE is simpler and sufficient for unidirectional updates. WebSocket if bidirectional needed. |
| Structure | Monorepo (`apps/`, `packages/`, `modules/`) | Single Next.js project | Single project is correct for one deployable. Monorepo adds overhead. |
| Background jobs | Redis + BullMQ | setTimeout + cron | Current is simpler and sufficient for MVP volume. |

**Recommendation:** The current simpler architecture is correct for a solo developer building an MVP. The user's preferred stack is more aligned with a team development scenario or a project that's past validation. If the team grows to 2+ developers, consider migrating to the user's preferred structure.

### Specific architecture concern: modules/ directory

The user suggests a separate `modules/` directory structure:

```
modules/
  auth/
  users/
  providers/
  requests/
  matching/
  offers/
  orders/
  ratings/
  notifications/
  admin/
```

The current architecture has this as `src/domain/`:

```
src/domain/
  auth/
  requests/
  offers/
  orders/
  providers/
  matching/
  notifications/
  ratings/
  location/
```

**These are the same thing with different names.** The current structure is correct. The naming is a preference, not an architecture issue.

---

## Scaling Assessment

### Current Design Handles

| Load | Supported? | Bottleneck |
|------|-----------|-----------|
| 100 concurrent users | ✅ Easily | None |
| 500 concurrent users | ✅ Comfortable | None |
| 1,000 concurrent users | ✅ With monitoring | SSE connections, DB connection pool |
| 5,000 concurrent users | ⚠️ Needs optimization | Separate DB, connection pooling, possibly Redis for SSE |
| 10,000+ concurrent users | ❌ Needs scaling | Multiple app instances, load balancer, Redis pub/sub |

**For Astana MVP:** Even the most optimistic scenario doesn't exceed 500 concurrent users in the first year. The current architecture is appropriate.

---

## Recommended Architecture Changes (Before Implementation)

### Change 1: User Role Model

**Current:** `User.role = ENUM('motorist', 'provider', 'admin')`  
**Problem:** A person can't be both motorist and provider  
**Fix:** Either:
- (a) Add a `roles` array column: `roles: TEXT[] DEFAULT ['motorist']`
- (b) Add a `user_role` junction table
- (c) Allow role switching with a toggle in the app

**Recommended:** Option (a) — simplest, sufficient for MVP. A user signs up as motorist, later can add provider role.

### Change 2: Optional Vehicle on Request

**Current:** `ServiceRequest.vehicleId: UUID FK → Vehicle` (required)  
**Problem:** Forces user to register vehicle before creating emergency request  
**Fix:** Make `vehicleId` nullable. Allow request without vehicle. Prompt to add vehicle while waiting for offers.

### Change 3: Database-Driven Timers

**Current:** `setTimeout` for radius expansion and auto-offline  
**Problem:** Lost on server restart  
**Fix:** Store `next_expansion_at` and `auto_offline_at` timestamps in database. Run a periodic check every 60 seconds.

### Change 4: Single PostGIS Column

**Current:** `latitude DECIMAL` + `longitude DECIMAL` + `geography(Point, 4326)` column  
**Problem:** Redundant, requires keeping in sync  
**Fix:** Use only PostGIS geography column. Extract coordinates with `ST_Y(location)` and `ST_X(location)`.

### Change 5: Add Admin to Phase 1

**Current:** Admin is "Post-Validation"  
**Problem:** Can't operate marketplace without admin tools  
**Fix:** Basic admin (provider verification, order inspection) is Phase 1.

---

## Overall Architecture Score: 7/10

**Strengths:**
- Boring technology (correct principle)
- No over-engineering
- Clear module boundaries
- Appropriate scaling path
- Good database design

**Weaknesses:**
- Minor schema issues (dual-role, optional vehicle, dual location)
- Timer reliability (setTimeout)
- Admin deferred too late
- SSE decision may need revisiting depending on deployment

The architecture is **ready for implementation** with the 5 changes above.
