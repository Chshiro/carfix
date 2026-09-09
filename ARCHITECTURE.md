# CARFIX — ARCHITECTURE

**Version:** 1.0  
**Date:** 2026-09-09  
**Status:** MVP Architecture

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT                            │
│         Next.js (React + TypeScript)                 │
│         Mobile-first responsive PWA                  │
│         Russian UI                                   │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS / WSS
                   │
┌──────────────────▼──────────────────────────────────┐
│                 API SERVER                            │
│           Next.js API Routes                         │
│         (or standalone Fastify if needed)             │
│                                                      │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │  Auth   │ │ Requests │ │  Offers  │ │ Orders  │ │
│  │ Module  │ │  Module  │ │  Module  │ │ Module  │ │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └────┬────┘ │
│       │           │            │             │      │
│  ┌────▼───────────▼────────────▼─────────────▼────┐ │
│  │            Domain Services Layer               │ │
│  │    (matching, notifications, state machine)    │ │
│  └────────────────┬───────────────────────────────┘ │
└───────────────────┬─────────────────────────────────┘
                    │
         ┌──────────┼──────────┐
         │          │          │
    ┌────▼───┐ ┌────▼───┐ ┌───▼────┐
    │PostgreSQL│ │  S3   │ │ Redis  │
    │+ PostGIS │ │(files)│ │(opt.)  │
    └─────────┘ └───────┘ └────────┘
```

### Key Principles

1. **Modular monolith** — single deployable with clean domain boundaries
2. **Full-stack TypeScript** — shared types between client and server
3. **PostgreSQL as the primary data store** — reliable, well-understood, PostGIS for geospatial
4. **Server-Sent Events (SSE) for real-time** — simpler than WebSockets, sufficient for our use case
5. **No separate services** — everything runs in one process until proven insufficient

---

## 2. Technology Stack

### Frontend

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **Next.js 14+ (App Router)** | Framework | SSR for SEO landing pages, API routes eliminate separate backend, excellent TypeScript support |
| **React 18+** | UI library | Industry standard, large ecosystem |
| **TypeScript (strict)** | Language | Type safety across full stack |
| **CSS Modules** | Styling | Scoped styles, no runtime overhead, simple |
| **next-pwa** | PWA support | Service worker, offline shell, install prompt |

### Backend (Next.js API Routes)

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **Next.js API Routes** | HTTP endpoints | Same deployment as frontend, no separate server for MVP |
| **Drizzle ORM** | Database access | Type-safe, SQL-like syntax, no magic, good PostgreSQL support |
| **drizzle-kit** | Migrations | Schema-driven migrations |
| **jose** | JWT handling | Lightweight, standards-compliant |
| **libphonenumber-js** | Phone number validation | Kazakhstan phone format validation |

### Database

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **PostgreSQL 16** | Primary database | Reliable, mature, excellent geospatial support |
| **PostGIS** | Geospatial queries | Distance calculation, radius search, geographic indexing |

### Real-Time

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **Server-Sent Events (SSE)** | Push updates to client | Simpler than WebSockets; one-directional (server→client) is sufficient; auto-reconnect built in; works through proxies |
| **Polling fallback** | When SSE unavailable | Simple periodic GET for degraded environments |

### File Storage

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **S3-compatible storage** | Image uploads | Scalable, cheap; use MinIO for local dev, any S3-compatible provider in production |

### Maps / Geolocation

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **2GIS Maps API** | Map display, geocoding | Widely used in Kazakhstan, good local coverage, free tier available |
| **Browser Geolocation API** | GPS coordinates | Native browser API, no additional dependency |
| **PostGIS** | Distance calculations | Server-side; ST_DWithin for radius queries, ST_Distance for precise distance |

**Why 2GIS Maps?** Google Maps is expensive at scale. Yandex Maps has political/sanctions uncertainty. 2GIS is local, free-tier-friendly, and has the best address coverage for Kazakhstan cities.

### Authentication

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **SMS OTP (via local provider)** | Phone verification | Standard auth for Kazakhstan marketplace apps |
| **JWT (short-lived access + longer refresh)** | Session management | Stateless auth, simple, well-understood |

Local SMS providers for Kazakhstan: SMS.kz, Mobizon, SMSC.kz. Evaluate by cost per SMS, reliability, and API quality.

### Notifications

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **Web Push API** | PWA push notifications | Native browser push, works when app is closed |
| **SMS (via same provider)** | Fallback notifications | When push is unavailable or unregistered |

### Deployment

| Technology | Purpose | Rationale |
|-----------|---------|-----------|
| **Single VPS** | Hosting | One server is sufficient for MVP (2-4 vCPU, 8GB RAM) |
| **Docker Compose** | Service orchestration | App + PostgreSQL + MinIO in one compose file |
| **PM2 or Node.js** | Process management | Auto-restart, basic monitoring |
| **Nginx** | Reverse proxy + SSL | Standard, reliable |
| **Let's Encrypt** | SSL certificates | Free, automated |

**NOT using:** Kubernetes, Vercel (latency to Kazakhstan), AWS (cost/complexity for MVP), separate CI/CD pipelines (GitHub Actions for basic checks).

### What Is NOT in the Stack

| Technology | Reason for Exclusion |
|-----------|---------------------|
| Redis | Not needed for MVP. Session storage via JWT. No caching layer needed at <1000 users. Re-evaluate if SSE connection management requires it. |
| BullMQ / job queues | Not needed. SMS sending and notification dispatch can be fire-and-forget async functions. No queue infrastructure. |
| GraphQL | REST is simpler. We have a small, well-defined API surface. |
| tRPC | Interesting but adds a dependency. Next.js API routes with shared types achieve similar type safety. |
| Turborepo / Nx | Single Next.js project. No monorepo tooling needed until there's actually more than one deployable. |
| Socket.io | SSE is sufficient. WebSockets add complexity (connection management, heartbeats, scaling). |

---

## 3. Project Structure

**Decision: Single Next.js project, NOT a monorepo.**

A monorepo is justified when you have multiple deployables (web app + mobile app + admin panel + shared packages). We have ONE deployable. A monorepo would add tooling overhead for zero benefit.

```
carfix/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── (auth)/                 # Auth routes (login, register)
│   │   ├── (motorist)/             # Motorist-facing pages
│   │   │   ├── requests/           # Create/view requests
│   │   │   ├── offers/             # View offers for a request
│   │   │   ├── orders/             # Active/completed orders
│   │   │   └── profile/            # User profile, vehicles
│   │   ├── (provider)/             # Provider-facing pages
│   │   │   ├── dashboard/          # Incoming requests, active jobs
│   │   │   ├── offers/             # My submitted offers
│   │   │   ├── orders/             # Active/completed orders
│   │   │   └── profile/            # Provider profile, specializations
│   │   ├── (admin)/                # Admin routes (protected)
│   │   ├── api/                    # API routes
│   │   │   ├── auth/               # Login, register, verify OTP
│   │   │   ├── requests/           # CRUD for service requests
│   │   │   ├── offers/             # CRUD for provider offers
│   │   │   ├── orders/             # Order state transitions
│   │   │   ├── providers/          # Provider profiles, availability
│   │   │   ├── vehicles/           # Vehicle management
│   │   │   ├── ratings/            # Rating submission
│   │   │   ├── upload/             # Image upload
│   │   │   └── sse/                # Server-Sent Events endpoint
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Landing page
│   │
│   ├── domain/                     # Business logic (framework-agnostic)
│   │   ├── auth/                   # Auth service, OTP logic
│   │   ├── requests/               # Request creation, validation, matching
│   │   ├── offers/                 # Offer logic, acceptance, rejection
│   │   ├── orders/                 # State machine, transitions
│   │   ├── providers/              # Provider management, availability
│   │   ├── matching/               # Provider matching algorithm
│   │   ├── notifications/          # Notification dispatch (push, SMS)
│   │   ├── ratings/                # Rating logic
│   │   └── location/              # Geospatial utilities
│   │
│   ├── db/                         # Database layer
│   │   ├── schema/                 # Drizzle schema definitions
│   │   ├── migrations/             # Generated migrations
│   │   ├── seed/                   # Seed data for development
│   │   └── client.ts               # Database connection
│   │
│   ├── lib/                        # Shared utilities
│   │   ├── sms/                    # SMS provider integration
│   │   ├── storage/                # S3 file upload
│   │   ├── maps/                   # Maps API integration
│   │   └── validation/             # Shared validation schemas (zod)
│   │
│   ├── components/                 # React components
│   │   ├── ui/                     # Generic UI components
│   │   ├── map/                    # Map components
│   │   ├── request/                # Request-related components
│   │   ├── offer/                  # Offer display components
│   │   └── layout/                 # Layout components
│   │
│   └── types/                      # Shared TypeScript types
│       ├── domain.ts               # Core domain types
│       ├── api.ts                  # API request/response types
│       └── database.ts             # Database-specific types (inferred from Drizzle)
│
├── public/                         # Static assets
│   ├── icons/                      # PWA icons
│   └── manifest.json               # PWA manifest
│
├── drizzle.config.ts               # Drizzle configuration
├── next.config.js                  # Next.js configuration
├── tsconfig.json                   # TypeScript config (strict)
├── package.json
├── .env.example                    # Environment variables template
├── docker-compose.yml              # PostgreSQL + MinIO for local dev
├── Dockerfile                      # Production build
└── README.md
```

### Key Structural Decisions

1. **`src/domain/` is framework-agnostic.** Business logic does not import from Next.js, React, or Drizzle directly. It receives dependencies via function parameters or simple dependency injection.

2. **`src/app/api/` routes are thin controllers.** They validate input (Zod), call domain services, and format responses. No business logic in route handlers.

3. **`src/db/schema/` defines the database.** Drizzle schema files are the source of truth for the database structure. TypeScript types are inferred from schema where possible.

4. **`src/types/` contains shared types.** These are used by both client and server. API request/response types live here to ensure type safety across the boundary.

---

## 4. Domain Modules

### Module Map

| Module | Responsibility | MVP Priority |
|--------|---------------|-------------|
| **auth** | Phone registration, OTP verification, JWT tokens, role management | Phase 1 |
| **users** | User profiles (shared between motorist and provider roles) | Phase 1 |
| **vehicles** | Vehicle registration (make, model, year) | Phase 3 |
| **providers** | Provider profiles, specializations, credential verification | Phase 2 |
| **provider-availability** | Online/offline status, location updates | Phase 2 |
| **requests** | Service request creation, validation, publishing | Phase 3 |
| **matching** | Find eligible providers for a request (category + distance + availability) | Phase 4 |
| **notifications** | Push notifications, SMS fallback | Phase 4 |
| **offers** | Provider offer creation, customer comparison, acceptance | Phase 5 |
| **orders** | Order state machine, lifecycle management | Phase 6 |
| **ratings** | Post-completion ratings, both directions | Phase 7 |
| **location** | Geospatial utilities, distance calculation, reverse geocoding | Phase 2 |

### Module Dependencies

```
auth ← (none)
users ← auth
vehicles ← users
providers ← users
provider-availability ← providers, location
requests ← users, vehicles, location
matching ← requests, providers, provider-availability, location
notifications ← (external: push API, SMS provider)
offers ← requests, providers, matching
orders ← requests, offers, notifications
ratings ← orders, users
```

---

## 5. Data Model

### Entity Relationship Overview

```
User (1) ──── (0..n) Vehicle
  │
  ├── (0..1) ProviderProfile ──── (1..n) ProviderSpecialization
  │            │
  │            └── (0..1) ProviderAvailability
  │
  ├── (0..n) ServiceRequest ──── (0..n) RequestMedia
  │            │
  │            └── (0..n) ProviderOffer
  │                        │
  │                        └── (0..1) Order
  │
  └── (0..n) Rating
```

### Core Entities

#### User

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `phone` | VARCHAR(20) | Unique, E.164 format |
| `name` | VARCHAR(100) | Display name |
| `role` | ENUM('motorist', 'provider', 'admin') | User role |
| `avatarUrl` | TEXT | Profile photo URL |
| `isPhoneVerified` | BOOLEAN | OTP verification status |
| `createdAt` | TIMESTAMP | Registration time |
| `updatedAt` | TIMESTAMP | Last update |

#### Vehicle

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `userId` | UUID FK → User | Owner |
| `make` | VARCHAR(50) | Manufacturer (Toyota, Hyundai, etc.) |
| `model` | VARCHAR(50) | Model (Camry, Accent, etc.) |
| `year` | SMALLINT | Year of manufacture |
| `licensePlate` | VARCHAR(20) | Optional, for identification |
| `createdAt` | TIMESTAMP | |

#### ProviderProfile

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `userId` | UUID FK → User | Unique |
| `businessName` | VARCHAR(200) | Business or personal brand name |
| `description` | TEXT | Short bio |
| `experienceYears` | SMALLINT | Years of experience |
| `credentialDocUrl` | TEXT | Uploaded credential document URL |
| `verificationStatus` | ENUM('pending', 'verified', 'rejected') | Admin verification |
| `rating` | DECIMAL(2,1) | Aggregate rating (updated on each new rating) |
| `completedJobs` | INTEGER | Counter (updated on completion) |
| `createdAt` | TIMESTAMP | |

#### ProviderSpecialization

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `providerProfileId` | UUID FK → ProviderProfile | |
| `category` | ENUM (ServiceCategory values) | What this provider can service |

#### ProviderAvailability

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `providerProfileId` | UUID FK → ProviderProfile | Unique |
| `isOnline` | BOOLEAN | Currently accepting requests |
| `latitude` | DECIMAL(10,7) | Current latitude |
| `longitude` | DECIMAL(10,7) | Current longitude |
| `locationUpdatedAt` | TIMESTAMP | When location was last updated |
| `serviceRadiusKm` | SMALLINT | Max distance willing to travel (default 10) |
| `lastActiveAt` | TIMESTAMP | Last meaningful app activity |

**Critical rules:**
- Location older than 30 minutes → provider excluded from matching
- `isOnline = false` → provider excluded from matching
- `lastActiveAt` older than 4 hours → auto-set `isOnline = false`

#### ServiceRequest

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `customerId` | UUID FK → User | Request creator |
| `vehicleId` | UUID FK → Vehicle | |
| `category` | ENUM (ServiceCategory) | Problem category |
| `description` | TEXT | Free text (optional) |
| `serviceType` | ENUM('provider_comes', 'customer_goes', 'towing') | |
| `latitude` | DECIMAL(10,7) | Request location |
| `longitude` | DECIMAL(10,7) | |
| `address` | VARCHAR(500) | Human-readable address |
| `status` | ENUM (RequestStatus values) | Current state |
| `selectedOfferId` | UUID FK → ProviderOffer | Chosen offer |
| `searchRadiusKm` | SMALLINT | Current search radius |
| `notifiedProviderCount` | INTEGER | How many providers were notified |
| `createdAt` | TIMESTAMP | |
| `publishedAt` | TIMESTAMP | |
| `expiresAt` | TIMESTAMP | Auto-expiration time |
| `completedAt` | TIMESTAMP | |

#### RequestMedia

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `requestId` | UUID FK → ServiceRequest | |
| `url` | TEXT | S3 URL |
| `mimeType` | VARCHAR(50) | image/jpeg, image/png, etc. |
| `createdAt` | TIMESTAMP | |

#### ProviderOffer

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `requestId` | UUID FK → ServiceRequest | |
| `providerId` | UUID FK → User | |
| `price` | INTEGER | Amount in tiyn (1/100 KZT) |
| `priceMax` | INTEGER | Max price for PRICE_RANGE (nullable) |
| `pricingModel` | ENUM('fixed_price', 'after_inspection', 'price_range') | |
| `etaMinutes` | SMALLINT | Estimated arrival time |
| `message` | VARCHAR(500) | Optional note |
| `distanceKm` | DECIMAL(4,1) | Distance at offer time |
| `status` | ENUM('pending', 'accepted', 'rejected', 'withdrawn', 'expired') | |
| `finalPrice` | INTEGER | Actual price after service (nullable) |
| `createdAt` | TIMESTAMP | |

**Constraint:** One offer per provider per request (UNIQUE on requestId + providerId).

#### Order

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `requestId` | UUID FK → ServiceRequest | Unique — one order per request |
| `offerId` | UUID FK → ProviderOffer | The accepted offer |
| `customerId` | UUID FK → User | |
| `providerId` | UUID FK → User | |
| `status` | ENUM (OrderStatus values) | Current state |
| `customerConfirmed` | BOOLEAN | Customer confirmed completion |
| `providerConfirmed` | BOOLEAN | Provider confirmed completion |
| `cancellationReason` | TEXT | If cancelled |
| `cancelledBy` | ENUM('customer', 'provider', 'system', 'admin') | Who cancelled |
| `createdAt` | TIMESTAMP | |
| `enRouteAt` | TIMESTAMP | |
| `arrivedAt` | TIMESTAMP | |
| `startedAt` | TIMESTAMP | |
| `completedAt` | TIMESTAMP | |
| `cancelledAt` | TIMESTAMP | |

#### Rating

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `orderId` | UUID FK → Order | |
| `fromUserId` | UUID FK → User | Who gave the rating |
| `toUserId` | UUID FK → User | Who received the rating |
| `score` | SMALLINT | 1-5 |
| `comment` | TEXT | Optional text review |
| `createdAt` | TIMESTAMP | |

**Constraint:** UNIQUE on orderId + fromUserId (one rating per user per order).

#### Notification

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `userId` | UUID FK → User | Recipient |
| `type` | VARCHAR(50) | Notification type (new_request, offer_received, provider_selected, etc.) |
| `title` | VARCHAR(200) | Notification title |
| `body` | TEXT | Notification body |
| `data` | JSONB | Additional data (requestId, offerId, etc.) |
| `channel` | ENUM('push', 'sms', 'in_app') | Delivery channel |
| `deliveredAt` | TIMESTAMP | When delivered (nullable) |
| `readAt` | TIMESTAMP | When read (nullable) |
| `createdAt` | TIMESTAMP | |

---

## 6. Geolocation Architecture

### Data Storage

- Provider locations stored in `ProviderAvailability` table as `DECIMAL(10,7)` latitude/longitude
- Request locations stored in `ServiceRequest` table as `DECIMAL(10,7)` latitude/longitude
- **PostGIS** used for efficient spatial queries

### Spatial Indexing

```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geography column to provider_availability
ALTER TABLE provider_availability 
ADD COLUMN location GEOGRAPHY(Point, 4326);

-- Create spatial index
CREATE INDEX idx_provider_availability_location 
ON provider_availability USING GIST(location);

-- Trigger to auto-update geography column when lat/lng change
-- (or compute in application layer)
```

### Distance Queries

```sql
-- Find providers within X km of a request location
SELECT 
  pa.*,
  ST_Distance(
    pa.location,
    ST_MakePoint(:requestLng, :requestLat)::geography
  ) / 1000 AS distance_km
FROM provider_availability pa
JOIN provider_specialization ps ON ps.provider_profile_id = pa.provider_profile_id
WHERE pa.is_online = true
  AND pa.location_updated_at > NOW() - INTERVAL '30 minutes'
  AND ps.category = :requestCategory
  AND ST_DWithin(
    pa.location,
    ST_MakePoint(:requestLng, :requestLat)::geography,
    :radiusMeters
  )
ORDER BY distance_km ASC;
```

### Location Update Strategy

1. **Provider goes ONLINE:** App requests GPS → sends location to server → stored with timestamp
2. **Provider location updates:** Every 10 minutes while online, client sends updated location (only if moved >500m)
3. **Staleness check:** Location older than 30 minutes → provider excluded from matching
4. **Auto-offline:** No activity for 4 hours → set `isOnline = false`
5. **Privacy:** Customer sees distance only (e.g., "2.3 km away"), not provider's exact coordinates, until offer is accepted

---

## 7. Real-Time Request Distribution

### Request Publishing Pipeline

```
1. Customer publishes request
   │
2. Validate request
   │ - Has category
   │ - Has location
   │ - Has vehicle
   │ - Customer is authenticated
   │
3. Set status = PUBLISHED, set expiresAt
   │
4. Execute matching query
   │ - Find providers: ONLINE + matching category + within radius + fresh location
   │
5. Record notified providers (notifiedProviderCount)
   │
6. Dispatch notifications (async, non-blocking)
   │ - Push notification to each eligible provider
   │ - SMS fallback if push not available
   │
7. Emit SSE event to customer: { type: 'request_published', notifiedCount: N }
   │
8. Start radius expansion timer (if configured)
   │
9. As offers arrive:
   │ - Validate offer (one per provider per request)
   │ - Store offer
   │ - Emit SSE event to customer: { type: 'new_offer', offer: {...} }
   │ - Update request status to OFFERS_RECEIVED (if first offer)
   │
10. Customer selects offer → see Acceptance Pipeline
```

### Radius Expansion (Async)

```
After initial broadcast:
  Wait 3 minutes
  If offers < 2:
    Expand to 10 km
    Find NEW eligible providers (exclude already notified)
    Notify new providers
    
  Wait 3 more minutes
  If offers < 1:
    Expand to 20 km
    Find NEW eligible providers
    Notify new providers
    
  Wait 4 more minutes
  If offers = 0:
    Set status = EXPIRED (if customer hasn't set longer timeout)
    Notify customer: "No providers available"
```

### Implementation Note

Radius expansion does NOT require a job queue. A simple `setTimeout` in the Node.js process is sufficient for MVP. If the server restarts, active requests have their `expiresAt` timestamp — a startup routine can re-evaluate pending requests.

---

## 8. Concurrency Strategy

### Critical Concurrency Scenarios

#### Scenario 1: Customer selects a provider while another offer arrives

**Solution:** Offer acceptance is an atomic database transaction.

```sql
BEGIN;

-- Lock the request row
SELECT * FROM service_request 
WHERE id = :requestId 
FOR UPDATE;

-- Verify request is still in PUBLISHED or OFFERS_RECEIVED status
-- Verify selected offer exists and is in PENDING status

-- Update request
UPDATE service_request 
SET status = 'provider_selected', selected_offer_id = :offerId 
WHERE id = :requestId AND status IN ('published', 'offers_received');

-- Accept the selected offer
UPDATE provider_offer SET status = 'accepted' WHERE id = :offerId;

-- Reject all other offers
UPDATE provider_offer SET status = 'rejected' 
WHERE request_id = :requestId AND id != :offerId AND status = 'pending';

-- Create order
INSERT INTO "order" (request_id, offer_id, customer_id, provider_id, status)
VALUES (:requestId, :offerId, :customerId, :providerId, 'provider_selected');

COMMIT;
```

#### Scenario 2: Two customers select the same provider simultaneously

**Not a problem in MVP.** A provider CAN have multiple active orders. If a provider is busy, they simply won't respond to new requests (or they go offline). The system does not prevent a provider from accepting multiple jobs — that's the provider's choice.

**Future consideration:** If provider utilization tracking shows this causes quality issues, add a "max concurrent jobs" setting.

#### Scenario 3: Provider goes offline while customer is reviewing their offer

**Solution:** Offer is immutable once submitted. The provider's current status is irrelevant to an already-submitted offer. If the provider's status changes after selection, the order may be cancelled — handled by the state machine.

#### Scenario 4: Request expires while customer is selecting an offer

**Solution:** The `SELECT ... FOR UPDATE` lock in the acceptance transaction will check the current status. If the status is already `EXPIRED`, the acceptance fails gracefully and the customer is notified.

#### General Rules

1. **Optimistic UI, pessimistic transactions.** Show offers immediately in the UI, but validate state in the database transaction.
2. **Immutable offers.** Once submitted, an offer cannot be modified. Provider can only withdraw.
3. **Single acceptance.** Only one offer can be accepted per request (enforced by unique `selectedOfferId`).
4. **Idempotent state transitions.** Transitioning to the current state is a no-op, not an error.

---

## 9. AI Integration Boundary

### Current Status: NOT in MVP

AI is Phase 8. The marketplace must function without AI.

### Future Interface

When AI is added, it must be a single isolated module:

```typescript
// src/domain/ai/classifier.ts

interface RequestClassification {
  category: ServiceCategory;
  confidence: number;
  suggestedSpecialists: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  clarifyingQuestions?: string[];
}

interface AIClassifier {
  classifyRequest(description: string): Promise<RequestClassification>;
}

// Implementation swappable: OpenAI, Google AI, local model, etc.
```

### Rules

1. AI module has NO access to database
2. AI module has NO access to user data beyond the request description
3. AI classification is ALWAYS optional — user can override
4. AI never generates diagnostic claims
5. AI provider is swappable via environment configuration
6. AI failure degrades gracefully — manual category selection always works
7. No AI infrastructure in the tech stack until Phase 8

---

## 10. Security

### Authentication

- **Phone + SMS OTP:** 6-digit code, 5-minute expiry, max 3 attempts
- **JWT Access Token:** 15-minute expiry, stored in memory (not localStorage)
- **JWT Refresh Token:** 30-day expiry, stored in httpOnly secure cookie
- **Rate limiting on OTP:** Max 5 OTP requests per phone number per hour

### Authorization

| Role | Permissions |
|------|------------|
| `motorist` | Create requests, view own requests, accept offers, rate providers, manage vehicles |
| `provider` | View eligible requests, create offers, manage availability, update location, manage profile |
| `admin` | All above + verify providers, manage disputes, view analytics |

- **Row-level security:** Users can only access their own data (enforced in queries)
- **Role-based route protection:** Middleware checks role before allowing access

### Input Validation

- All API inputs validated with **Zod** schemas
- File uploads: validate MIME type, max size (5MB), only images
- Phone numbers: validate Kazakhstan format (+7XXXXXXXXXX)
- Text inputs: sanitize HTML, limit length
- Coordinates: validate range (lat: -90 to 90, lng: -180 to 180)

### Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| OTP request | 5 | 1 hour |
| OTP verify | 3 | 5 minutes |
| Request creation | 5 | 1 hour |
| Offer creation | 20 | 1 hour |
| Image upload | 15 | 1 hour |
| General API | 100 | 1 minute |

Implementation: Simple in-memory rate limiter for MVP (no Redis needed at this scale).

### Privacy

- Provider location: only distance shown to customers before acceptance
- Phone numbers: exchanged only after offer acceptance
- Customer location: shared only with selected provider
- Images: stored in private S3 bucket, accessed via signed URLs
- Data retention: comply with Kazakhstan's data protection law

---

## 11. Observability

### MVP Observability Stack

| What | How |
|------|-----|
| **Application logs** | Structured JSON logging via `pino` |
| **Error tracking** | Sentry (free tier) |
| **Business events** | Log to database table for analytics |
| **Uptime monitoring** | External ping service (UptimeRobot, free tier) |

### Key Events to Log

| Event | Data |
|-------|------|
| `request.created` | requestId, category, location (city-level), serviceType |
| `request.published` | requestId, notifiedProviderCount, searchRadius |
| `request.expired` | requestId, offerCount, timeToExpiry |
| `offer.created` | offerId, requestId, providerId, price, eta, distance |
| `offer.accepted` | offerId, requestId, totalOffers, selectedPrice, selectedEta |
| `order.status_changed` | orderId, fromStatus, toStatus, actor |
| `order.completed` | orderId, duration, finalPrice vs estimatedPrice |
| `provider.online` | providerId, location (city-level) |
| `provider.offline` | providerId, onlineDuration |
| `notification.sent` | userId, channel, type, success |
| `notification.failed` | userId, channel, type, error |

### What NOT to Build

- No distributed tracing (single service)
- No custom metrics dashboards (use database queries on business events)
- No ELK/Grafana stack (overkill for MVP)
- No performance monitoring APM (Sentry covers errors; manual investigation for performance)

---

## 12. Scaling Path

### Phase: MVP (0-6 months)

**Scale:** <1,000 users, <100 daily requests, <100 providers

| Component | Configuration |
|-----------|--------------|
| Server | Single VPS (2 vCPU, 8GB RAM) |
| Database | PostgreSQL on same VPS |
| Storage | MinIO or S3 |
| Real-time | SSE (single server = simple) |
| Caching | None |
| CDN | None |

### Phase: City-Level Growth (6-18 months)

**Scale:** 1,000-10,000 users, <1,000 daily requests, <500 providers

| Change | Reason |
|--------|--------|
| Separate database server | DB performance isolation |
| Add Redis | Session caching, rate limiting, SSE pub/sub if needed |
| Add CDN for static assets | Reduce server load, improve latency |
| Upgrade VPS to 4-8 vCPU | Handle more concurrent connections |

### Phase: Multiple Cities (18-36 months)

**Scale:** 10,000-100,000 users, <10,000 daily requests, <2,000 providers

| Change | Reason |
|--------|--------|
| Managed PostgreSQL (e.g., RDS equivalent) | Reliability, backups, failover |
| Application load balancer + 2-3 app instances | Horizontal scaling |
| Redis for SSE fan-out | Multiple app instances need shared pub/sub |
| Background job queue (BullMQ) | SMS, push, analytics become too heavy for inline |
| Separate admin panel | Admin queries shouldn't impact user-facing performance |

### Phase: Regional Expansion (36+ months)

**Scale:** 100,000+ users

| Change | Reason |
|--------|--------|
| Service decomposition (if needed) | Only split services that have different scaling profiles |
| Read replicas | Read-heavy workloads (provider search, request listing) |
| Full CI/CD pipeline | More developers, more releases |
| Consider native apps | If PWA limitations become measurable |

### Anti-Scaling Rules

1. **Never scale preemptively.** Scale in response to measured bottlenecks.
2. **Every infrastructure addition must solve a specific problem.** "It might be useful" is not justification.
3. **Prefer vertical scaling before horizontal.** A bigger VPS is simpler than a cluster.
4. **Measure first.** If you can't point to the slow query or the CPU spike, you don't need to scale.
