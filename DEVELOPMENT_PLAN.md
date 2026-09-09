# CARFIX — DEVELOPMENT PLAN

**Version:** 1.0  
**Date:** 2026-09-09  
**Status:** Pre-Implementation

---

## Overview

This plan breaks the MVP into 8 vertical phases. Each phase delivers a working, testable slice of the product. No phase should take longer than 2-3 weeks for a solo developer.

**Critical rule:** Each phase must be completable and verifiable before the next phase begins. Do not build Phase 4 (matching) before Phase 3 (requests) is working end-to-end.

---

## Phase 0 — Business & Product Validation (COMPLETE)

### Deliverables
- [x] AUDIT.md — Full business audit
- [x] PRODUCT.md — Product specification
- [x] ARCHITECTURE.md — Technical architecture
- [x] DEVELOPMENT_PLAN.md — This document
- [x] DECISIONS.md — Architectural Decision Records
- [x] README.md — Project overview
- [x] MVP decision and scope definition

### Exit Criteria
- All documents reviewed and approved
- Clear scope boundary defined
- No speculative features in plan

---

## Phase 1 — Technical Foundation

**Goal:** Working project skeleton with auth, database, and deployment pipeline.

### Deliverables

| Task | Description |
|------|-------------|
| **Project initialization** | Next.js 14 with App Router, TypeScript (strict), ESLint, Prettier |
| **Docker Compose** | PostgreSQL 16 + PostGIS for local development |
| **Database schema** | Drizzle schema for User table; migrations working |
| **Authentication** | Phone + SMS OTP flow (with mock SMS provider for dev) |
| **JWT tokens** | Access token + refresh token; httpOnly cookies |
| **Role management** | motorist / provider / admin roles |
| **Basic middleware** | Auth guard, role guard, rate limiter (in-memory) |
| **Environment config** | .env.example, validated env loading |
| **Basic layout** | Mobile-first shell with navigation |
| **Health check endpoint** | GET /api/health → { status: 'ok', db: 'ok' } |

### Technical Details

- SMS OTP: Use a mock provider (console log) for development. Real SMS integration deferred to Phase 4.
- Rate limiter: Simple in-memory Map with sliding window. No Redis.
- JWT: jose library. Access token: 15 min. Refresh: 30 days.
- Database: Drizzle schema-first. Generate migrations via drizzle-kit.

### Tests

| Test | Type | Validates |
|------|------|-----------|
| OTP generation and verification | Unit | Auth logic |
| JWT creation and validation | Unit | Token handling |
| User registration flow | Integration | API → DB → Response |
| Auth middleware rejects invalid tokens | Integration | Security |
| Rate limiter blocks excess requests | Unit | Rate limiting |

### Exit Criteria
- `npm run dev` starts app with working auth
- Can register with phone number (mock OTP)
- Can log in and receive JWT
- Database migrations run cleanly
- TypeScript compiles with no errors
- All tests pass

---

## Phase 2 — Provider Onboarding

**Goal:** A provider can register, set up their profile, choose specializations, and go online/offline.

### Deliverables

| Task | Description |
|------|-------------|
| **Provider profile** | Create/edit profile (name, photo, business name, experience, description) |
| **Specialization selection** | Provider selects one or more service categories |
| **Credential upload** | Upload business certificate or trade document (stored in S3) |
| **Availability toggle** | Online/offline switch with GPS location capture |
| **Location updates** | Periodic location update while online (client-side) |
| **Provider profile page** | Public profile showing name, rating, specializations, completed jobs |
| **Provider dashboard** | Landing page showing online status, current location on map |

### Database Schema Additions

- `provider_profile` table
- `provider_specialization` table
- `provider_availability` table (with PostGIS geography column)
- File upload infrastructure (S3-compatible storage connection)

### Technical Details

- File upload: Presigned URL pattern — client uploads directly to S3, server stores URL
- Location: Browser Geolocation API → send to server on status change and every 10 min
- PostGIS: Add `geography(Point, 4326)` column, create GIST index
- Auto-offline: Scheduled check (every 15 min) sets providers offline if no activity in 4 hours

### Tests

| Test | Type | Validates |
|------|------|-----------|
| Provider profile CRUD | Integration | API → DB |
| Specialization selection stores correctly | Integration | Data integrity |
| Availability toggle changes status | Integration | State management |
| Location update stores with timestamp | Integration | Geospatial data |
| Stale location excluded from queries | Integration | Matching correctness |
| Auto-offline after inactivity | Integration | Provider management |

### Exit Criteria
- Provider can register, create profile, select specializations
- Provider can go online/offline with location
- Provider profile is viewable
- PostGIS spatial queries work (verified with test data)
- Location staleness rules enforced

---

## Phase 3 — Customer Request Creation

**Goal:** A motorist can register a vehicle and create a structured service request.

### Deliverables

| Task | Description |
|------|-------------|
| **Vehicle registration** | Add/edit vehicle (make, model, year) |
| **Vehicle selector** | Choose from registered vehicles when creating request |
| **Request creation form** | Multi-step: category → vehicle → description → photos → location → service type |
| **Category selection UI** | Visual category picker with icons |
| **Image upload** | Client-side compression + upload (max 3 images) |
| **Location capture** | GPS with map preview and manual pin adjustment |
| **Request preview** | Review screen before publishing |
| **Request publishing** | Submit → status becomes PUBLISHED |
| **Request list** | Motorist can see their request history |
| **Request detail** | View a published request with all details |

### Database Schema Additions

- `vehicle` table
- `service_request` table
- `request_media` table

### Technical Details

- Image compression: client-side using canvas API (target: 500KB max)
- Map: 2GIS Maps API (or OpenStreetMap/Leaflet as fallback if 2GIS API not readily available)
- Reverse geocoding: Convert GPS coordinates to human-readable address
- Request expiry: Set `expiresAt` to `publishedAt + 30 minutes` by default

### Tests

| Test | Type | Validates |
|------|------|-----------|
| Vehicle CRUD | Integration | Data management |
| Request creation with all fields | Integration | Full flow |
| Request creation with minimal fields (category + location) | Integration | Minimum viable request |
| Image upload and storage | Integration | File handling |
| Request status transitions | Unit | State machine |
| Request expiration | Integration | Auto-cleanup |
| Request validation rejects invalid data | Unit | Input validation |

### Exit Criteria
- Motorist can add a vehicle
- Motorist can create a request with category, location, optional description, optional photos
- Request is stored and viewable
- Images upload and display correctly
- Location shows on map

---

## Phase 4 — Marketplace Matching & Notifications

**Goal:** When a request is published, eligible nearby providers are found and notified.

### Deliverables

| Task | Description |
|------|-------------|
| **Matching engine** | Query: online + matching category + within radius + fresh location |
| **Provider notification** | In-app notification when eligible request appears |
| **SSE infrastructure** | Server-Sent Events for real-time updates |
| **Notification storage** | Persist notifications in database |
| **Request view for providers** | Provider can see eligible requests on their dashboard |
| **Request detail for provider** | Provider views full request details (category, vehicle, description, photos, distance) |
| **Radius expansion** | Auto-expand radius if insufficient responses |
| **SMS integration** | Real SMS sending for notifications (integrate actual SMS provider) |
| **Push notifications** | Web Push API for PWA notifications |

### Database Schema Additions

- `notification` table

### Technical Details

- **SSE implementation:** Next.js API route that holds open a connection. Client subscribes on page load. Server emits events for new requests (providers) and new offers (customers).
- **Matching query:** PostGIS `ST_DWithin` + category filter + online filter + location freshness filter
- **Radius expansion:** `setTimeout` — after 3 min expand to 10 km, after 6 min expand to 20 km
- **SMS provider:** Integrate SMS.kz or Mobizon (evaluate free tier / cost per SMS)
- **Push notifications:** Web Push API with VAPID keys

### Tests

| Test | Type | Validates |
|------|------|-----------|
| Matching finds correct providers (category + distance + online) | Integration | Core matching logic |
| Matching excludes offline providers | Integration | Availability filtering |
| Matching excludes providers with stale location | Integration | Staleness rule |
| Matching excludes providers outside radius | Integration | Distance filtering |
| SSE delivers events to connected clients | Integration | Real-time infrastructure |
| Radius expansion finds additional providers | Integration | Expansion logic |
| Notification is created and stored | Integration | Notification system |
| SMS sends successfully (mock in test) | Unit | SMS integration |

### Exit Criteria
- Publishing a request triggers matching and notification
- Correct providers are found (verified with test data)
- Provider sees new request in their dashboard in real-time
- Radius expansion works when insufficient providers respond
- SMS and push notifications deliver

---

## Phase 5 — Provider Offers

**Goal:** Providers can submit offers; motorists can compare and select.

### Deliverables

| Task | Description |
|------|-------------|
| **Offer creation form** | Provider submits price, pricing model, ETA, optional message |
| **Pricing model UI** | Clear UX distinguishing fixed, after-inspection, range |
| **Offer submission** | Store offer, notify customer |
| **Offer comparison view** | Customer sees all offers for their request in real-time |
| **Offer cards** | Display: provider name, photo, rating, price, pricing model, ETA, distance, message |
| **Sorting/filtering** | Sort offers by price, ETA, rating |
| **Provider profile preview** | Customer can view full provider profile from offer card |
| **One offer per provider** | Enforce uniqueness |
| **Offer withdrawal** | Provider can withdraw their offer |

### Database Schema Additions

- `provider_offer` table

### Technical Details

- Real-time offers: When provider submits offer, emit SSE event to the customer watching that request
- Pricing display: Format KZT with thousands separator, clearly label pricing model
- Offer validation: Price > 0, ETA > 0, ETA < 480 (8 hours max), message < 500 chars

### Tests

| Test | Type | Validates |
|------|------|-----------|
| Offer creation with all pricing models | Integration | Offer submission |
| Duplicate offer rejected | Integration | Uniqueness constraint |
| Offer appears in customer's comparison view | Integration | Real-time delivery |
| Offer withdrawal changes status | Integration | Withdrawal flow |
| Offer validation rejects invalid data | Unit | Input validation |
| Provider can only offer on eligible requests | Integration | Authorization |

### Exit Criteria
- Provider can submit an offer on a request they were notified about
- Customer sees offers arriving in real-time
- Offers display all information clearly
- Pricing models are visually distinguishable
- Duplicate offers are prevented

---

## Phase 6 — Order Lifecycle

**Goal:** Complete transaction loop — from offer acceptance through service completion.

### Deliverables

| Task | Description |
|------|-------------|
| **Offer acceptance** | Customer selects an offer; other offers rejected; order created |
| **Atomic acceptance** | Database transaction prevents race conditions |
| **Order status transitions** | PROVIDER_SELECTED → EN_ROUTE → ARRIVED → IN_PROGRESS → PENDING_COMPLETION → COMPLETED |
| **Provider status controls** | Buttons: "В пути" → "На месте" → "Начал работу" → "Завершил" |
| **Customer confirmation** | Customer confirms completion |
| **Final price entry** | If pricing model is after_inspection or range, provider enters final price |
| **Cancellation flow** | Either party can cancel with reason |
| **Order detail view** | Both parties see current order status and details |
| **Order history** | List of past orders for both motorist and provider |
| **Provider rejection notification** | Non-selected providers are notified |
| **Phone number exchange** | After acceptance, both parties see each other's phone number |

### Database Schema Additions

- `order` table

### Technical Details

- **Acceptance transaction:** SELECT FOR UPDATE on request row, then update request + offer statuses + create order in single transaction
- **State machine enforcement:** Validate transition is legal before applying (e.g., cannot go from EN_ROUTE to COMPLETED)
- **Phone exchange:** Phone numbers visible in order detail only after status >= PROVIDER_SELECTED
- **Cancellation:** Before EN_ROUTE = free cancellation. After EN_ROUTE = requires reason, may affect rating.

### Tests

| Test | Type | Validates |
|------|------|-----------|
| Offer acceptance creates order | Integration | Core flow |
| Concurrent acceptance blocked | Integration | Race condition prevention |
| All state transitions valid | Unit | State machine |
| Invalid transitions rejected | Unit | State machine |
| Cancellation updates all states correctly | Integration | Cancellation flow |
| Final price recorded on completion | Integration | Pricing accuracy |
| Phone numbers visible after acceptance | Integration | Privacy |
| Non-selected providers notified | Integration | Notification |

### Exit Criteria
- Full order lifecycle works: accept → en_route → arrived → in_progress → completed
- Race conditions handled (concurrent acceptance test passes)
- Cancellation works from any cancellable state
- Both parties see order progress
- Phone numbers exchanged after acceptance

---

## Phase 7 — Trust Layer (Ratings & History)

**Goal:** After completing an order, both parties can rate each other. Ratings are visible and build trust.

### Deliverables

| Task | Description |
|------|-------------|
| **Rating prompt** | After order completion, prompt both parties to rate |
| **Rating form** | 1-5 stars + optional comment |
| **Bidirectional ratings** | Customer rates provider AND provider rates customer |
| **Aggregate rating** | Provider's profile shows average rating and job count |
| **Rating display** | Show ratings on provider profile and in offer cards |
| **Service history** | Detailed history for both motorist (past requests) and provider (past jobs) |
| **Report mechanism** | "Report a problem" button → creates support ticket |
| **Provider verification badge** | Verified providers show a badge on their profile |

### Database Schema Additions

- `rating` table
- Denormalized `rating` and `completed_jobs` columns on `provider_profile`

### Technical Details

- Rating aggregation: Update provider_profile.rating = AVG of all ratings. Simple trigger or application-level update on rating creation.
- Rating eligibility: Only after order is COMPLETED. Each user can rate once per order.
- Report: Simple insert into a support tickets table or send via email to admin.

### Tests

| Test | Type | Validates |
|------|------|-----------|
| Rating creation after completed order | Integration | Rating flow |
| Duplicate rating rejected | Integration | Uniqueness |
| Rating before completion rejected | Integration | Eligibility |
| Aggregate rating calculated correctly | Integration | Aggregation |
| Rating appears on provider profile | Integration | Display |
| Rating appears in offer comparison | Integration | Trust information |

### Exit Criteria
- Both parties can rate each other after completion
- Ratings are visible on provider profiles and in offer cards
- Service history is accurate and complete
- Aggregate rating updates correctly

---

## Phase 8 — AI-Assisted Request Structuring (Post-Validation)

**Goal:** Optionally improve request creation by using AI to classify problem descriptions.

### Deliverables

| Task | Description |
|------|-------------|
| **AI classifier module** | Isolated module with swappable provider |
| **Text classification** | User description → category suggestion |
| **Clarifying questions** | AI may suggest follow-up questions |
| **UI integration** | After user types description, show AI-suggested category (user can override) |
| **Fallback** | If AI fails, gracefully fall back to manual selection |

### Technical Details

- **Provider:** OpenAI API or Google AI API (evaluate cost, latency from Kazakhstan)
- **Interface:** Single function `classifyRequest(description: string) → RequestClassification`
- **Prompt:** Structured prompt with service categories, returns JSON
- **Caching:** Simple in-memory cache for identical descriptions (unlikely but cheap)
- **Cost control:** Max 1 AI call per request creation. Timeout: 5 seconds.

### Tests

| Test | Type | Validates |
|------|------|-----------|
| AI classifier returns valid category | Integration | Classification |
| AI classifier handles timeout gracefully | Unit | Error handling |
| AI classifier handles malformed response | Unit | Robustness |
| Manual category selection works without AI | Integration | Fallback |

### Exit Criteria
- AI suggestions appear for text descriptions
- User can always override AI suggestion
- AI failure doesn't break request creation
- AI module is replaceable (different provider via env config)

---

## Critical End-to-End Test Scenario

This test must pass before the product is considered launch-ready (after Phase 7):

```
1. Customer registers with phone number → verified
2. Customer adds vehicle (2019 Toyota Camry)
3. Provider registers with phone number → verified
4. Provider creates profile (auto electrician)
5. Provider selects specialization: ELECTRICAL_STARTING
6. Provider goes ONLINE with location (51.128, 71.430)
7. Customer creates request:
   - Category: ELECTRICAL_STARTING
   - Vehicle: 2019 Toyota Camry
   - Description: "Не заводится, стартер щёлкает"
   - Location: (51.131, 71.435) — 0.5 km from provider
   - Service type: PROVIDER_COMES
8. Customer publishes request
9. Provider receives notification
10. Provider views request details
11. Provider creates offer:
    - Price: 8,000 KZT (fixed price)
    - ETA: 15 minutes
    - Message: "Скорее всего стартер, возьму с собой запасной"
12. Customer sees offer appear in real-time
13. Customer selects this offer
14. Order created: PROVIDER_SELECTED
15. Provider taps "В пути" → EN_ROUTE
16. Provider taps "На месте" → ARRIVED
17. Provider taps "Начал работу" → IN_PROGRESS
18. Provider taps "Завершил" → PENDING_COMPLETION
    - Final price: 8,000 KZT (same as estimate)
19. Customer confirms → COMPLETED
20. Customer rates provider: 5 stars, "Быстро и качественно"
21. Provider rates customer: 5 stars
22. Provider profile shows: rating 5.0, 1 completed job
23. Order appears in both parties' history
```

### Failure Scenarios to Also Test

| Scenario | Expected Behavior |
|----------|-------------------|
| No providers online | Request expires, customer sees "no providers available" |
| Provider offline but has stale location | Excluded from matching |
| Customer cancels after publishing | Request → CANCELLED, providers notified |
| Provider doesn't respond (timeout) | Radius expands, eventually expires |
| Two customers select same provider | Both orders succeed (provider manages workload) |
| Provider cancels after being selected | Order → CANCELLED, customer notified, can republish |
| Customer disputes final price | Order → DISPUTED, admin review |

---

## Timeline Estimate (Solo Developer)

| Phase | Estimated Duration | Cumulative |
|-------|-------------------|-----------|
| Phase 0 — Audit & Planning | 1 week | Week 1 |
| Phase 1 — Foundation | 2 weeks | Week 3 |
| Phase 2 — Provider Onboarding | 2 weeks | Week 5 |
| Phase 3 — Request Creation | 2 weeks | Week 7 |
| Phase 4 — Matching & Notifications | 2-3 weeks | Week 10 |
| Phase 5 — Provider Offers | 1-2 weeks | Week 12 |
| Phase 6 — Order Lifecycle | 2 weeks | Week 14 |
| Phase 7 — Trust Layer | 1 week | Week 15 |
| **Subtotal: Launch-ready MVP** | **~15 weeks** | |
| Phase 8 — AI (post-validation) | 1-2 weeks | Week 17 |

**Notes:**
- These estimates assume a single full-time developer
- Add 20-30% buffer for unexpected complexity
- UI polish and bug fixes should be continuous, not a separate phase
- Real SMS integration (Phase 4) depends on SMS provider API quality

---

## Post-Launch Priorities

After Phase 7, before Phase 8, the priority shifts to operations:

1. **Supply acquisition:** Manually onboard 50+ providers
2. **Controlled testing:** Run test requests with real providers
3. **Response time validation:** Measure actual time-to-first-offer
4. **Customer acquisition:** Begin limited marketing in pilot zones
5. **Marketplace health monitoring:** Track fulfillment rate daily
6. **Provider feedback collection:** Understand provider experience
7. **Bug fixing and UX iteration:** Based on real usage data

Phase 8 (AI) is only justified after the marketplace loop is validated with real transactions.
