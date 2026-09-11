# CARFIX — FULL PROJECT AUDIT v2

**Date:** 2026-09-09  
**Market:** Astana, Kazakhstan  
**Status:** Phase 0 — Pre-Implementation (Re-audit with expanded scope)

---

## Executive Summary

### What exists in this repository

**6 markdown documents. Zero production code. Zero tests. Zero database schema. Zero UI.**

This is not a software project yet. It is a business plan with an architecture proposal. That's not necessarily bad — it means there's no technical debt to fix. But it also means every claim about the product is a theoretical claim. Nothing has been validated by running code, real users, or real providers.

### How close is this to a working MVP?

**0% implemented.** The planning documents are comprehensive and well-structured, but the gap between planning and a working marketplace is 15-17 weeks of engineering work by the project's own estimate. Given that this is a solo developer project building a two-sided marketplace from zero, the realistic estimate is closer to **20-24 weeks** (accounting for unforeseen complexity, provider API integrations, and UX iteration).

### Is the concept worth building?

**Conditionally yes.** The core hypothesis — real-time matching of car owners with nearby automotive service providers — is a proven model globally (ClickMechanic UK, YourMechanic/Wrench US, RepairSmith/AutoNation). No one has executed it well in Kazakhstan. The market conditions are favorable:

- 1.68M population in Astana, 402K registered cars
- Fragmented supply, no dominant real-time platform
- inDrive has trained users on the request-broadcast model
- Kolesa.kz is a directory, not a transaction marketplace
- GService.kz exists but is more equipment/B2B focused
- WhatsApp groups have no accountability, no pricing, no matching

### Brutal assessment

The previous audit was **good** but too narrow in scope. It missed critical competitive intelligence (Kolesa.kz has a repair services section; GService.kz exists), underweighted the legal complexity (auto repair requires ИП registration in Kazakhstan — self-employed status doesn't cover it), and did not question the architectural choice of SSE vs WebSocket with sufficient rigor. The prompt requirements from the user are significantly more comprehensive than what was addressed.

The documents also have a **self-congratulatory tone problem**: they conclude that Phase 0 is "complete" and ready for implementation. Phase 0 is not complete until the founder has **talked to at least 5 real providers in Astana** and confirmed they would use the app. No amount of markdown replaces that conversation.

---

## 1. Current Project State

### Repository contents

| File | Size | Content Quality | Issues |
|------|------|----------------|--------|
| [AUDIT.md](file:///c:/carfix/AUDIT.md) | 31KB | Good overall | Missing Kolesa.kz competitor analysis; missing legal analysis depth; too narrow on supply types |
| [PRODUCT.md](file:///c:/carfix/PRODUCT.md) | 25KB | Good | User journeys well-defined; missing Admin journey; missing provider verification flow |
| [ARCHITECTURE.md](file:///c:/carfix/ARCHITECTURE.md) | 35KB | Good | Sound technical choices; missing Notification table details in some areas; SSE decision should be revisited |
| [DEVELOPMENT_PLAN.md](file:///c:/carfix/DEVELOPMENT_PLAN.md) | 22KB | Good | Phased, testable; timeline slightly optimistic |
| [DECISIONS.md](file:///c:/carfix/DECISIONS.md) | 12KB | Good | 9 well-structured ADRs |
| [README.md](file:///c:/carfix/README.md) | 4.5KB | Adequate | Placeholder "Getting Started" (nothing to start yet) |

### What does NOT exist

- `package.json` — no project initialized
- `src/` — no source code
- `docker-compose.yml` — no database
- Any tests
- Any UI components
- Any API endpoints
- Any database schema (code)
- `.env.example`
- CI/CD configuration
- Git history (no `.git`)

### Can any user journey be completed end-to-end?

**No.** Not a single step of any journey can be executed. There is no application.

---

## 2. What Is Already Good

### 2.1 Product thinking

The documents demonstrate genuine product thinking, not just technical architecture:
- Problem definition is specific and actionable (not "build a platform")
- Customer and provider personas are realistic for Kazakhstan
- JTBD framework is correctly applied
- State machine is complete and well-thought-out
- Pricing models (fixed, after-inspection, range) reflect real automotive industry practices

### 2.2 MVP discipline

The scope is admirably restrained:
- AI deferred to Phase 8
- No payments in MVP
- No native apps
- No multi-city
- Russian only
- No chat
- Free marketplace model

This is correct. Many similar projects die by trying to build everything at once.

### 2.3 Technical choices

The "boring technology" principle is correctly applied:
- PostgreSQL + PostGIS — exactly right for geospatial marketplace
- Drizzle over Prisma — good for PostGIS raw SQL needs
- Single Next.js deployment — appropriate for solo developer
- JWT auth — standard, well-understood
- No Redis, no message queues, no microservices

### 2.4 Marketplace analysis

The liquidity analysis, radius expansion strategy, and provider density calculations are reasonable. The recognition that supply liquidity is the existential risk is correct.

### 2.5 State machine

The order state machine (DRAFT → PUBLISHED → OFFERS_RECEIVED → PROVIDER_SELECTED → EN_ROUTE → ARRIVED → IN_PROGRESS → PENDING_COMPLETION → COMPLETED) is comprehensive. Cancellation and expiry paths are defined. Transition rules are explicit.

### 2.6 Concurrency handling

The `SELECT FOR UPDATE` approach for offer acceptance is correct. The recognition that concurrent acceptance is a real problem, and the decision to handle it with database-level locking, is sound.

---

## 3. Critical Problems

### P0-1: No code exists

**Severity:** P0  
**Impact:** There is no product to test, demo, or validate.  
**Status:** Expected at this stage, but the documents claim "Phase 0 COMPLETE" — this is misleading. Phase 0 should include at minimum a project skeleton with `npm run dev` working.

### P0-2: No supply validation

**Severity:** P0  
**Impact:** The entire marketplace hypothesis depends on providers using the app. Zero providers have been interviewed.  
**Action:** Before spending 20 weeks coding, the founder must personally talk to 10-20 auto electricians and mobile mechanics in Astana. This is not optional. It is the single most valuable thing that can be done right now, and it costs zero engineering time.

### P0-3: Competitor blind spot — Kolesa.kz

**Severity:** P0 (strategic)  
**Impact:** Kolesa.kz already has a "Ремонт и услуги" section with geographic filtering, direct contact, and AI-driven recommendations. The original audit did not mention Kolesa.kz as a repair services competitor — only as a car classifieds site. This is a significant competitive intelligence gap.

**Kolesa.kz is the most likely competitor to add real-time matching features.** They already have massive user base, brand trust, and the technical infrastructure. CarFix's positioning must explicitly address: "Why would a provider use CarFix when Kolesa.kz already sends them customers?"

**Answer (must be validated):** Kolesa.kz is a directory. CarFix is a real-time transaction marketplace with competitive offers. The difference is passive listing vs. active matching. But this difference only matters if CarFix actually delivers customers faster than Kolesa.kz — which requires supply density, which requires providers, which requires validation.

### P0-4: Legal risk — Provider registration requirements

**Severity:** P0 (legal)  
**Impact:** Auto repair is NOT covered by Kazakhstan's self-employed (самозанятый) tax regime as of 2026. Providers performing auto repair commercially must register as ИП (Individual Entrepreneur) with appropriate OKED codes. The platform must:

1. Verify that providers have ИП registration (or operate as a legal entity)
2. Not actively enable unregistered commercial auto repair activity
3. Include appropriate disclaimers about platform liability

`LEGAL REVIEW REQUIRED` — The platform's legal model (intermediary marketplace vs. employer vs. referral service) must be reviewed by a Kazakhstan-licensed lawyer. This affects:
- Platform liability for service quality
- Tax obligations
- Consumer protection
- Personal data handling under Kazakhstan's Law on Personal Data

### P0-5: Trust & safety model is too thin

**Severity:** P0-P1  
**Impact:** The current model allows any verified phone number holder to become a provider and potentially work on safety-critical vehicle systems. The prompt correctly identifies that "не любой Вася с ключом 10 мм может чинить тормоза."

**Missing:** Provider tiering system (Level 1/2/3 as described in the user's prompt). The current PRODUCT.md has only a binary verified/unverified model. Need:

- **New provider:** Limited categories (battery, jump-start, basic diagnostics only)
- **Verified independent master:** Full categories after credential review
- **Verified service (СТО):** Full categories + business verification

**Safety-critical work restrictions:** Brakes, steering, suspension — these should require Level 1 or Level 2 verification. This is not an MVP blocker if the initial categories are limited to electrical/starting/battery, but the architecture must support category-level access control from Day 1.

---

## 4. Product Problems

### 4.1 Supply type scope is too narrow

The original documents focus almost exclusively on mobile auto electricians and mobile mechanics. The user's prompt correctly identifies a broader supply hierarchy:

**Priority A (MVP):**
- Mobile auto electricians ✓ (covered)
- Mobile mechanics ✓ (covered)
- Battery/jump-start ✓ (covered)
- Diagnostics (partially covered)

**Priority B (should be in architecture, implementation deferred):**
- Шиномонтаж (tire service) — mentioned but deferred
- Эвакуаторы (tow trucks) — mentioned but deferred
- СТО (service stations) — barely addressed

**The architecture must support all provider types from Day 1**, even if the MVP only activates Priority A. The data model must accommodate fixed-location providers (СТО with an address, not GPS tracking) as well as mobile providers.

### 4.2 Service type model is incomplete

The current `serviceType` enum has 3 values: `PROVIDER_COMES`, `CUSTOMER_GOES`, `TOWING`. This is too simplistic.

**Missing considerations:**
- Provider can offer both "I come to you" AND "you come to me" simultaneously
- Provider can offer to arrange towing + subsequent repair
- Some providers (СТО) are always `CUSTOMER_GOES`
- The service type should be a provider attribute, not (only) a request attribute

### 4.3 Request creation flow friction

The current flow (PRODUCT.md Journey 1) has 6 steps before publishing. The user's prompt emphasizes:

> "Клиент должен создать заявку максимально быстро."

**Recommended:** Minimum viable request = category + location. Everything else optional. The current flow puts vehicle selection as step 2, which adds friction for a first-time user who hasn't registered a vehicle yet.

**Revised flow:**
1. What happened? (category selection — single tap)
2. Where are you? (GPS auto-detect — one confirm tap)
3. → PUBLISH (2 taps to broadcast)
4. Optional enrichment: vehicle, description, photos (can be added while waiting for offers)

### 4.4 Admin panel is completely undesigned

PRODUCT.md mentions admin as "SHOULD HAVE (Post-Validation)" but the user's prompt makes it clear that admin operations are MVP-critical:

- Verify/reject providers
- Inspect orders and disputes
- Block users
- View marketplace health metrics

Without admin tools, there's no way to operate the marketplace. The founder IS the admin. Admin is Phase 1, not "Post-Validation."

### 4.5 Pricing model for offers — missing breakdown

The user's prompt identifies the need for separate pricing components:
- Service cost
- Diagnostic fee
- Travel/visit cost (выезд)
- Parts cost
- Estimated total

The current model has a single `price` field. For MVP, this may be acceptable with a clear label ("общая стоимость"), but the architecture should support price breakdown in the near future.

### 4.6 Provider UX is underspecified

The provider experience is described only in broad strokes. The user's prompt specifies exactly what a provider needs to see:

```
🚗 Toyota Camry 2018
Проблема: Не заводится
📍 3.2 km
⏱ Срочно
[Могу] [Не могу]
```

This "glanceable card" UX is critical. If the provider has to navigate through 3 screens to understand the request, they won't respond fast enough for the urgency use case. The provider UX must be designed before coding begins.

---

## 5. Technical Problems

### 5.1 SSE vs WebSocket — decision needs revisiting

**The original decision:** SSE because real-time is unidirectional.

**Challenge:** While technically correct for the current spec, the user's prompt suggests WebSocket / Socket.IO as preferred. More importantly:

1. **Provider location updates** are client → server (not covered by SSE)
2. **Future chat** would require WebSocket
3. **Next.js API routes and SSE** have known issues with serverless deployments and connection limits
4. **Socket.IO** provides automatic fallback, reconnection, and room-based broadcasting out of the box

**Recommendation:** Keep SSE for MVP if deploying to a single VPS (not Vercel). SSE is genuinely simpler. But add ADR-010 acknowledging this is a tradeoff and specifying the reversal point.

If there's any chance of deploying to Vercel or any serverless platform, **switch to WebSocket/Socket.IO now** — SSE won't work properly in serverless environments.

### 5.2 Single-role user model is limiting

Current schema: `User.role = ENUM('motorist', 'provider', 'admin')`. This means a user can be ONLY a motorist OR a provider. What if a mechanic's car breaks down? What if someone provides battery service but also owns a car?

**Fix:** Users should have a primary role but can potentially have both roles. Consider a `user_role` junction table or a role array. At minimum, the schema should allow `role: 'provider'` users to create requests.

### 5.3 Request creation flow missing — step ordering in architecture

The ARCHITECTURE.md specifies that vehicle is required for request creation (`vehicleId: UUID FK → Vehicle`). This means a brand-new user must:
1. Register
2. Add a vehicle
3. THEN create a request

This is 3 steps before even describing the problem. Vehicle should be optional for MVP.

### 5.4 Auto-offline mechanism dependency on server uptime

The architecture specifies `setTimeout` for auto-offline (4 hours of inactivity) and radius expansion (3 min, 6 min, 10 min). If the server restarts, these timers are lost.

**Fix:** Use `expiresAt` timestamps in the database and a periodic cleanup job (every 1 minute). This is both simpler and more reliable than in-memory timers.

### 5.5 ProviderAvailability table design

Storing lat/lng as `DECIMAL(10,7)` AND having a PostGIS `geography(Point, 4326)` column is redundant. Either:
- Use only the PostGIS geography column (query with `ST_X()`, `ST_Y()` to extract coordinates)
- Or use only lat/lng with computed PostGIS queries (avoid the dual-storage)

**Recommended:** Use PostGIS geography as the source of truth. Extract lat/lng via `ST_Y(location)` and `ST_X(location)` when needed.

### 5.6 Missing database entities

The user's prompt lists entities that should exist but are missing from the current data model:
- `ProviderVerification` — separate from ProviderProfile, tracking verification history
- `OrderStatusHistory` — audit trail of status changes with timestamps and actors
- `Dispute` — separate entity for dispute tracking
- `AdminAction` — audit log for admin operations

For MVP, `OrderStatusHistory` is the most important — it provides an audit trail for disputes.

---

## 6. Marketplace Problems

### 6.1 The chicken-and-egg problem is not a problem to "solve" — it's a problem to survive

The documents correctly identify supply liquidity as the existential risk. But they propose a technical solution (radius expansion, SMS fallback) for what is fundamentally an operational problem.

**The real plan must be:**
1. Founder personally recruits 20+ providers before launching any marketing
2. First 50 requests are seeded by the founder or friendly testers
3. Founder monitors every request-to-offer cycle in real-time during the first month
4. If providers don't respond, founder calls them personally

No amount of engineering can substitute for this operational grind.

### 6.2 Provider retention is unaddressed

The documents discuss how to GET providers but not how to KEEP them. Key questions:

- What happens when a provider gets 1 request per week? They stop checking the app.
- How does the provider know the app is alive during quiet periods?
- What's the provider's onboarding experience? Is there a tutorial?

**Recommendation:** For MVP, focus on a curated Telegram group for providers. When a request comes in and no providers respond, the founder posts in the Telegram group. This is ugly but it works.

### 6.3 Disintermediation is barely addressed

The documents acknowledge the risk but offer no concrete MVP-phase mitigation. The honest truth:

**At MVP scale, disintermediation doesn't matter.** If a customer and provider connect through CarFix and then do future business directly, that's a SUCCESS — it proves the matching works. At 100 transactions/month, the focus should be on proving the loop works, not preventing leakage.

Disintermediation becomes a problem at scale, when it threatens revenue. That's a Year 2 problem.

### 6.4 No referral / viral mechanism

How does a motorist discover CarFix? The documents don't address customer acquisition at all.

**MVP acquisition channels to plan for:**
1. Provider tells customer "найди меня на CarFix" (provider-led)
2. Friend recommends after good experience (word-of-mouth)
3. 2GIS integration (list CarFix as a service in 2GIS)
4. Instagram/Telegram ads targeting Astana car groups
5. Physical QR code stickers at gas stations, parking lots

### 6.5 Geographic density is unquantified

The documents estimate 15-20 simultaneously active providers for minimum coverage. This is plausible but unvalidated. Key unknowns:

- How many auto electricians exist in Astana? (probably 200-500)
- What % would join a free marketplace? (optimistically 10-20%)
- What % would stay online regularly? (optimistically 30-50% of those who join)
- This gives us 6-50 potentially active providers — a very wide range

**Action:** Count auto electrician and mobile mechanic listings in 2GIS Astana. This gives the universe of potential supply.

---

## 7. UX Problems

### 7.1 Language inconsistency in documents

Documents mix English and Russian. All user-facing content must be in Russian. The documents should specify exact Russian strings for all UI elements.

### 7.2 No wireframes or mockups

Not a single screen has been designed, even as low-fidelity wireframes. Key screens that need design before coding:

1. **Motorist home screen** — "Нужна помощь?" CTA
2. **Category selection** — visual picker
3. **Request waiting screen** — showing offers arriving
4. **Offer comparison cards** — the most important UX
5. **Provider dashboard** — incoming requests
6. **Provider request card** — "glanceable" format
7. **Offer creation form** — pricing model selection
8. **Order status screen** — both perspectives

### 7.3 Offline / degraded experience

What happens when the user has poor connectivity? The documents mention "3G support" but don't specify behavior:

- Request creation should queue locally and retry
- Offer display should work with cached data
- Critical actions (publish, accept) must have retry logic with user feedback

---

## 8. Trust & Safety Problems

### 8.1 No safety-critical work restrictions

As noted in P0-5. The current model allows any provider to offer any service. For MVP with only electrical/starting categories, this is acceptable. But the architecture must support category restrictions from the beginning.

### 8.2 Provider identity verification is manual and unscalable

The current plan: "Provider uploads a document → admin manually reviews." This works for 50 providers. It doesn't work for 500. But at MVP scale, this is fine. Plan for automated verification later.

### 8.3 No incident response process

What happens if:
- A provider damages a customer's car?
- A customer claims provider stole something?
- A customer is in a dangerous situation with a provider?

**MVP minimum:** A "Report" button that immediately sends an email to the founder. Not a ticketing system, not a CRM — just a direct email with all order details.

### 8.4 Privacy — pre-selection location sharing

The architecture correctly states "only distance before acceptance." But need to verify this is enforced in every API endpoint. Provider should NOT receive customer's exact coordinates until the offer is accepted.

---

## 9. Business Model Risks

### 9.1 Zero-revenue period may be longer than expected

If marketplace validation takes 6 months and supply acquisition takes another 3, the founder needs to survive 9-12 months with zero revenue. This requires either:
- Personal savings
- External funding
- A day job (which limits development time)

### 9.2 Kaspi Pay integration is harder than acknowledged

When monetization begins (paid leads or commission), Kaspi Pay is the obvious payment method in Kazakhstan. But Kaspi Pay integration requires:
- Business registration
- API partnership agreement
- Technical integration
- Compliance with financial regulations

This is not a weekend project. Plan 2-3 months for Kaspi Pay integration when the time comes.

### 9.3 Provider economics — will they find value?

Key question: How many paying jobs per week does a provider need to consider the platform valuable?

- If a mobile auto electrician charges 5,000-15,000 ₸ per job
- And CarFix delivers 1 extra job per day
- That's 5,000-15,000 ₸/day additional revenue
- At ~120,000-360,000 ₸/month additional revenue

This is meaningful. But it requires the marketplace to actually deliver 1 job/day/provider consistently. At MVP scale with 50 weekly requests and 30 active providers, that's ~1.7 requests/provider/week — not enough to be transformative.

---

## 10. Legal Risks

### `LEGAL REVIEW REQUIRED`

The following items require review by a Kazakhstan-licensed lawyer:

| Item | Risk Level | Urgency |
|------|-----------|---------|
| Platform legal model (intermediary vs. employer) | Critical | Before launch |
| Provider ИП/legal entity requirement enforcement | Critical | Before launch |
| Liability for service quality / damage | Critical | Before launch |
| Consumer protection under RK law | High | Before launch |
| Personal data handling (Law on Personal Data and Their Protection) | High | Before launch |
| Geolocation data collection and retention | Medium | Before launch |
| Photo/video of customer vehicles (data processing) | Medium | Before launch |
| User agreement / public offer template | High | Before launch |
| Dispute resolution mechanism (arbitration clause?) | Medium | Before launch |
| Provider credential verification obligations | High | Before launch |

**Key legal fact discovered:** Since January 2026, Kazakhstan's self-employed regime covers only 40 specific activity types. Auto repair is NOT on this list. Providers must register as ИП (Individual Entrepreneur) under appropriate OKED codes to legally perform commercial auto repair. The platform must handle this appropriately — either by requiring ИП verification or by clearly disclaiming responsibility.

---

## 11. Architecture Recommendation

### Keep the core choices

- ✅ Next.js modular monolith
- ✅ PostgreSQL + PostGIS
- ✅ Drizzle ORM
- ✅ JWT auth with phone OTP
- ✅ PWA
- ✅ Single VPS deployment
- ✅ No microservices, no K8s, no Redis

### Change or add

| Change | Reason |
|--------|--------|
| Make vehicle optional in requests | Reduce request creation friction |
| Allow users to have both motorist and provider capabilities | Real-world flexibility |
| Use PostGIS geography as single source for location (remove duplicate lat/lng) | Data consistency |
| Add `OrderStatusHistory` table | Audit trail for disputes |
| Add provider tier system (new/verified_individual/verified_business) | Trust & safety |
| Replace `setTimeout` with database-driven periodic checks | Server restart resilience |
| Add admin routes to Phase 1 (not "post-validation") | Operational necessity |
| Consider provider notification via Telegram bot as MVP channel | More reliable than PWA push |

### Architecture principle alignment with user's prompt

The user's prompt prefers:
- `NestJS or Fastify` for backend
- `WebSocket / Socket.IO` for realtime
- Monorepo structure: `apps/`, `packages/`, `modules/`

Current architecture chose:
- `Next.js API Routes` for backend
- `SSE` for realtime
- Single project (no monorepo)

**Assessment:** Both approaches are valid. The current choices are simpler and more appropriate for a solo developer building an MVP. The user's suggestions are more aligned with a team development scenario. I recommend keeping the current simpler architecture for Phase 1-3, then evaluating whether to migrate to a separate backend (Fastify or NestJS) if Next.js API routes prove limiting.

---

## 12. Feature vs. Ideal MVP

| Feature | Exists | Works | Needed MVP | Priority | Action |
|---------|--------|-------|------------|----------|--------|
| Auth (phone + OTP) | ❌ | ❌ | ✅ | P0 | Build |
| Customer Request Creation | ❌ | ❌ | ✅ | P0 | Build |
| Provider Profile | ❌ | ❌ | ✅ | P0 | Build |
| Provider Availability (online/offline + location) | ❌ | ❌ | ✅ | P0 | Build |
| Matching Engine | ❌ | ❌ | ✅ | P0 | Build |
| Real-time Notifications | ❌ | ❌ | ✅ | P0 | Build |
| Provider Offers | ❌ | ❌ | ✅ | P0 | Build |
| Offer Comparison View | ❌ | ❌ | ✅ | P0 | Build |
| Order Lifecycle | ❌ | ❌ | ✅ | P0 | Build |
| Rating System | ❌ | ❌ | ✅ | P1 | Build |
| Admin Panel (basic) | ❌ | ❌ | ✅ | P1 | Build |
| SMS Notifications | ❌ | ❌ | ✅ | P1 | Build |
| Vehicle Registration | ❌ | ❌ | Optional | P2 | Build (simplified) |
| AI Classification | ❌ | ❌ | ❌ | P3 | Defer |
| Payments | ❌ | ❌ | ❌ | P3 | Defer |
| Chat | ❌ | ❌ | ❌ | P3 | Not now |
| Native Apps | ❌ | ❌ | ❌ | — | Not now |
| Multi-city | ❌ | ❌ | ❌ | — | Not now |

---

## 13. Project Score

| Dimension | Score | Explanation |
|-----------|-------|-------------|
| Problem Clarity | 8/10 | Clear problem, clear user, clear pain point. Well-articulated. |
| Customer Value Proposition | 7/10 | Strong for urgent cases. Weaker for planned repairs (but those aren't MVP). |
| Provider Value Proposition | 6/10 | "More customers" is clear. But unvalidated — providers may not want another app. |
| Marketplace Liquidity Readiness | 2/10 | Zero providers recruited. Zero supply validation. This is the biggest risk and it's completely untested. |
| UX | 1/10 | No UI exists. No wireframes. No design system. |
| MVP Scope | 8/10 | Well-constrained. Good discipline on what to exclude. |
| Architecture | 7/10 | Sound technical choices, appropriate for scale. Minor issues noted above. |
| Code Quality | N/A | No code exists |
| Security | 6/10 | Auth model is reasonable. Rate limiting planned. Privacy rules defined. Missing: IDOR prevention patterns, input sanitization strategy, CORS policy. |
| Trust & Safety | 4/10 | Basic verification planned. Missing: provider tiers, safety-critical restrictions, incident response, dispute handling. |
| Scalability | 7/10 | PostGIS, single VPS with scaling path. Appropriate for current stage. |
| Business Model | 6/10 | Free MVP → paid leads → commission is standard marketplace playbook. But no validation. |
| Launch Readiness | 1/10 | Nothing is built. No providers recruited. No legal review. |

**Overall: 5.1/10** — Good strategic thinking, zero execution.

---

## 14. 14-Day Execution Plan

Given the current state (zero code), here's what a focused 14-day sprint should achieve:

### Days 1-2: Foundation + Auth
- Initialize Next.js 14 project with TypeScript strict
- Docker Compose: PostgreSQL 16 + PostGIS
- Drizzle schema: `user` table
- Phone + OTP auth (mock SMS) 
- JWT access/refresh tokens
- Basic mobile-first layout shell
- Health check endpoint
- **Exit:** Can register, login, see empty home screen

### Days 3-4: Provider + Customer Core
- Drizzle schemas: `provider_profile`, `provider_specialization`, `provider_availability`, `vehicle`, `service_request`, `request_media`
- Provider profile CRUD API
- Provider availability toggle + location API
- Vehicle CRUD API (simplified)
- Request creation API
- **Exit:** Provider can create profile, go online. Customer can create request.

### Days 5-6: Matching + Notifications
- PostGIS matching query (online + category + radius + freshness)
- SSE endpoint for real-time events
- Request publishing → match → notify flow
- Provider dashboard showing incoming requests
- Request detail view for provider
- **Exit:** Publishing a request finds and notifies matching providers

### Days 7-8: Offers + Selection
- Offer creation API + form
- Offer comparison view (customer)
- Real-time offer arrival via SSE
- Offer acceptance (atomic DB transaction)
- Order creation on acceptance
- **Exit:** Provider can offer. Customer can compare and select. Order created.

### Days 9-10: Order Lifecycle
- Order state machine (all transitions)
- Provider status controls (en_route → arrived → in_progress → completed)
- Customer confirmation
- Phone number exchange after acceptance
- Final price entry
- Cancellation flow
- **Exit:** Full order lifecycle works end-to-end

### Days 11-12: Trust + Admin
- Rating system (both directions)
- Provider profile with rating display
- Admin: user list, provider verification, order inspection
- Report mechanism (simple email)
- **Exit:** Rating works. Admin can verify providers.

### Days 13: Polish + Bug Fixing
- Request creation flow optimization (2-tap minimum)
- Mobile UX polish
- Error handling
- Loading states
- Empty states

### Day 14: E2E Test + Closed Pilot Prep
- Run the critical E2E scenario (all 23 steps)
- Fix any blocking bugs
- Prepare seed data for pilot
- Set up production deployment (VPS + Docker Compose)
- **Exit:** Can demo the full loop

### Parallel (Founder, not developer):

During these 14 days, the founder should SIMULTANEOUSLY:
- **Days 1-7:** Identify and call 20 auto electricians in Astana from 2GIS
- **Days 7-14:** Personally onboard 5-10 providers to the platform
- **Day 14:** Seed 5 test requests and verify provider responses

---

## 15. Launch Checklist

Before the first real (non-test) user:

| Item | Status | Blocker? |
|------|--------|----------|
| E2E scenario passes (23 steps) | ❌ | Yes |
| 10+ verified providers active | ❌ | Yes |
| Legal review completed (platform model) | ❌ | Yes |
| User agreement / privacy policy published | ❌ | Yes |
| SSL certificate configured | ❌ | Yes |
| Production database with backups | ❌ | Yes |
| Error tracking (Sentry) configured | ❌ | No, but strongly recommended |
| Admin can verify/block providers | ❌ | Yes |
| SMS provider integrated | ❌ | No (can launch with push only for MVP) |
| Push notifications working | ❌ | Yes |
| Map display working | ❌ | Yes |
| Mobile UX tested on real devices (Android Chrome, iOS Safari) | ❌ | Yes |
| Request creation achievable in < 30 seconds | ❌ | Yes |
| Founder can monitor marketplace health in real-time | ❌ | Yes |

---

## 16. Metrics — What to Track from Day 1

### Business Events (database table)

```
request_created { requestId, category, location_district }
request_published { requestId, notified_count, radius }
request_expired { requestId, offer_count, time_alive }
offer_created { offerId, requestId, providerId, price, eta, distance }
offer_accepted { offerId, requestId, total_offers, selected_price }
offer_rejected { offerId, reason }
order_status_changed { orderId, from_status, to_status, actor, timestamp }
order_completed { orderId, duration_minutes, final_price, estimated_price }
order_cancelled { orderId, cancelled_by, reason, stage }
rating_created { ratingId, orderId, from_role, score }
provider_went_online { providerId, location }
provider_went_offline { providerId, was_online_minutes }
```

### KPI Dashboard (admin)

| Metric | Formula | Target (Month 3) |
|--------|---------|-------------------|
| Request Fulfillment Rate | requests_with_offers / published_requests | >60% |
| Time to First Offer | median(first_offer_created_at - request_published_at) | <5 min |
| Completion Rate | completed_orders / accepted_offers | >70% |
| Active Providers | providers_online_at_least_2h_today | >25 |
| Weekly Requests | count(requests, this_week) | >50 |
| Cancellation Rate | cancelled_orders / total_orders | <15% |
| Provider Response Rate | offers / notifications_sent | >20% |
| Average Rating | avg(ratings.score) | >4.0 |
| Repeat Customers | users_with_2+_requests / total_requesting_users | >15% |

### North Star Metric

**Completed Transactions per Week**

This captures both sides working. If this number grows, the marketplace is alive.

---

## 17. Founder Validation Plan

### Before writing code (ideally within 1 week)

| # | Task | Method | Success Signal |
|---|------|--------|----------------|
| 1 | Count auto electricians in Astana (2GIS) | 2GIS search | >100 listings |
| 2 | Call 20 auto electricians | Phone | >10 pick up, >5 express interest |
| 3 | Meet 5 providers in person | In-person meeting | >3 willing to try the app |
| 4 | Ask: "How do you get new customers now?" | Interview | Understand current channels |
| 5 | Ask: "Would you respond to a phone notification for a nearby job?" | Interview | >50% say yes |
| 6 | Ask: "What would make you stop using such a service?" | Interview | Understand churn risks |
| 7 | Ask: "How much would you pay for a guaranteed customer lead?" | Interview | Understand willingness to pay |
| 8 | Post "Машина не заводится, нужен электрик, район Сарыарка" in 3 WhatsApp/Telegram groups | Online | Measure response time & quality |
| 9 | Call 5 friends who own cars: "If your car didn't start tomorrow, what would you do?" | Phone | Understand customer behavior |
| 10 | Check Kolesa.kz repair services section for Astana volume | Web research | Understand competitor activity |

### Hypotheses to validate

| Assumption | Why Important | How to Validate | Success Threshold | Failure Signal |
|-----------|--------------|-----------------|-------------------|----------------|
| Auto electricians want more customers | Supply exists | Interview 20 providers | >50% express interest | <20% interested |
| Providers will respond within 10 minutes | UX depends on speed | Pilot test with 5 providers | >60% respond in 10 min | <30% respond in 10 min |
| Providers will use a web app (not just calls) | Technology adoption | Give 5 providers the MVP | >3 actively use it | <2 use it |
| Customers prefer competitive offers over calling 2GIS | Value proposition | A/B: app vs. manual search | App faster + cheaper | No difference |
| 5 km radius is sufficient for Astana core | Geographic coverage | Map analysis | >80% core Astana covered | Large gaps remain |
| Free platform attracts providers | Acquisition cost | Track signup rate | >20 in first month | <5 in first month |
| Customers trust unknown providers with ratings | Trust model | Monitor acceptance rate | >40% of offers accepted | <15% accepted |
| Price transparency creates value | Differentiation | Post-order survey | >70% cite price comparison as valuable | <30% find it useful |
| Urgent problems are frequent enough | Market size | Track request volume | >10/day in core area after 3 months | <2/day after 3 months |
| Off-platform migration is manageable | Business viability | Track repeat usage | >15% repeat rate | <5% repeat rate |

---

## 18. Final Verdict

**YELLOW — Build with corrections.**

The strategic thesis is sound. The product thinking is strong. The technical architecture is appropriate. The MVP scope is well-constrained.

But the project has a **critical operational gap**: zero supply validation. The entire business depends on providers actually using the platform, and not a single provider has been contacted. Before spending another hour on code, the founder must pick up the phone and call auto electricians in Astana.

**What I would do if this were my startup and I had 14 days:**

Days 1-3: Stop coding. Call 30 auto electricians from 2GIS Astana. Meet 5 in person. Ask the validation questions above. If fewer than 5 express genuine interest in receiving phone notifications for nearby jobs, **pivot the supply acquisition strategy** before building anything.

Days 4-14: Build the MVP with the corrections noted in this audit. Focus on the core loop: request → match → offer → select → complete → rate. Make request creation 2 taps. Make the provider card glanceable. Ship ugly but functional. Get 5 providers on the platform and run 10 test transactions.

Day 14: If 6/10 test requests got at least one offer within 10 minutes, the marketplace has a pulse. Continue. If not, investigate why providers aren't responding and fix the operational problem before adding features.

> **Строить.** Но не раньше, чем 5 реальных мастеров в Астане скажут «да, я буду на это отвечать». Никакой код не заменит этого разговора.
