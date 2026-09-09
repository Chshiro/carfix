# CARFIX — MVP SCOPE DEFINITION

**Date:** 2026-09-09  
**Status:** Final MVP scope after audit

---

## One-Sentence MVP

> A mobile-first web app where a car owner in Astana describes a problem in 2 taps, nearby verified auto specialists compete with price offers, and the owner selects the best one.

---

## What MVP MUST Do

The **complete marketplace loop**, end-to-end:

```
1. Customer opens app → registers (phone + OTP)
2. Customer taps problem category
3. Customer confirms location (GPS auto-detect)
4. → Request published (2 taps!)
5. System finds nearby online providers matching category
6. Providers get notification → see request card
7. Provider submits offer (price, ETA, message)
8. Customer sees offers arriving in real-time
9. Customer selects best offer
10. Order created → provider travels → arrives → works → completes
11. Customer confirms completion
12. Both parties rate each other
13. Rating visible on provider profile
```

**If any step in this loop is broken, the product has no value.**

---

## MVP Features — Exactly

### Customer (Motorist)

| Feature | Required? | Notes |
|---------|-----------|-------|
| Phone + OTP registration | ✅ Must | Standard KZ auth |
| Create request: select category | ✅ Must | Visual cards, single tap |
| Create request: confirm location | ✅ Must | GPS auto-detect + map pin adjustment |
| Create request: add description | Optional | Free text, enrichment during wait |
| Create request: add photos (max 3) | Optional | Client-side compression |
| Create request: add vehicle info | Optional | Can add while waiting for offers |
| View offers in real-time | ✅ Must | Core marketplace value |
| Compare offers (price, ETA, rating) | ✅ Must | Cards with sort |
| Select provider | ✅ Must | Single tap + confirmation |
| Track order status | ✅ Must | Progress indicator |
| See provider phone (after acceptance) | ✅ Must | Contact ability |
| Confirm completion | ✅ Must | Close the loop |
| Rate provider (1-5 stars + optional text) | ✅ Must | Trust layer |
| View request history | ✅ Must | Reference + stickiness |
| Cancel request/order | ✅ Must | User control |

### Provider

| Feature | Required? | Notes |
|---------|-----------|-------|
| Phone + OTP registration | ✅ Must | Same auth as customer |
| Create profile (name, photo, business name) | ✅ Must | Identity |
| Select specializations | ✅ Must | Category matching |
| Upload credential document | ✅ Must | Verification input |
| Go online/offline toggle | ✅ Must | Availability control |
| Send location when online | ✅ Must | Distance matching |
| Receive request notifications | ✅ Must | Core flow |
| View request details | ✅ Must | Decide whether to respond |
| Submit offer (price, pricing model, ETA, message) | ✅ Must | Core supply action |
| See acceptance notification | ✅ Must | Know you got the job |
| Update order status (en_route → arrived → in_progress → completed) | ✅ Must | Progress tracking |
| Enter final price (if estimate) | ✅ Must | Transparency |
| See customer phone (after acceptance) | ✅ Must | Contact ability |
| Rate customer | ✅ Must | Trust layer |
| View job history | ✅ Must | Record keeping |

### Admin

| Feature | Required? | Notes |
|---------|-----------|-------|
| View provider list | ✅ Must | Operations |
| Verify/reject providers | ✅ Must | Trust enforcement |
| View all requests | ✅ Must | Monitoring |
| View all orders | ✅ Must | Monitoring |
| View disputes/reports | ✅ Must | Safety |
| Suspend/block users | ✅ Must | Safety |
| Basic dashboard (active providers, daily requests, completion rate) | ✅ Must | Marketplace health |

### System

| Feature | Required? | Notes |
|---------|-----------|-------|
| Geospatial matching (PostGIS) | ✅ Must | Core matching engine |
| Real-time updates (SSE) | ✅ Must | Offer arrival, status changes |
| Radius expansion (5→10→20 km) | ✅ Must | Fallback when no nearby providers |
| Request expiration (30 min) | ✅ Must | Cleanup |
| Provider auto-offline (4h inactivity) | ✅ Must | Accuracy |
| Location staleness filter (30 min) | ✅ Must | Matching correctness |
| State machine enforcement | ✅ Must | Data integrity |
| Atomic offer acceptance (SELECT FOR UPDATE) | ✅ Must | Concurrency safety |

---

## What MVP Must NOT Do

| Feature | Why Not |
|---------|---------|
| AI problem classification | Manual category works. AI is Phase 8. |
| Photo-based damage estimation | Unreliable, liability risk. |
| In-app payments | Cash/Kaspi transfer. Payments add 2-3 months. |
| Chat between users | Structured offers. No chat. |
| Native iOS/Android apps | PWA first. |
| Real-time provider tracking on map | ETA is sufficient. Privacy concern. |
| Recommendation engine | No data. Distance + rating sorting. |
| Multi-city | Astana only. |
| Multi-language | Russian only. |
| Provider monetization | Free during validation. |
| Parts marketplace | Separate business. |
| Insurance integration | Legal partnerships needed. |
| Fleet management | B2B feature. Not MVP. |
| Desktop app | No justification. |
| Complex analytics / BI | Simple dashboard queries. |
| Complex notification platform | Push + SSE. SMS as fallback. |
| Provider scheduling | Online/offline toggle is sufficient. |
| Automated dispute resolution | Manual admin for MVP. |
| Multiple provider categories per request | One category per request. Simple. |
| Provider bidding wars / counter-offers | One offer per provider, immutable. Simple. |

---

## MVP Categories

| Category | Internal ID | Description | Provider Level Required |
|----------|------------|-------------|----------------------|
| Не заводится / Электрика | `electrical_starting` | Car won't start, electrical issues | Level 3+ |
| Аккумулятор / Прикурить | `battery_jumpstart` | Dead battery, jump-start needed | Level 3+ |
| Мобильный механик | `mobile_mechanic` | General mobile mechanic service | Level 2+ |

### Deferred Categories (Phase 2+)

| Category | Phase |
|----------|-------|
| Шиномонтаж | Phase 2 |
| Эвакуатор | Phase 2 |
| Диагностика | Phase 2 |
| СТО (стационарные) | Phase 3 |
| Кузовной ремонт | Phase 4+ |
| Плановое обслуживание | Phase 5+ |

---

## MVP Service Types

For MVP emergency categories, the default service type is `PROVIDER_COMES` (мастер приедет). Do not show service type selection for MVP — it adds friction to the request creation flow.

Service type selection will be added when non-emergency categories (СТО, scheduled maintenance) are introduced.

---

## MVP Pricing Models

| Model | Display | When Used |
|-------|---------|-----------|
| Фиксированная | `8 000 ₸` | Provider knows the exact price |
| После осмотра | `~8 000 ₸ (после осмотра)` | Need to diagnose first |
| Диапазон | `6 000 – 10 000 ₸` | Provider gives a range |

All prices in KZT. Stored as integers in tiyn (1 KZT = 100 tiyn). Display with thousands separator: `8 000 ₸`.

---

## MVP Success Criteria

### Before Public Launch (operational)

| Criterion | Target |
|-----------|--------|
| Verified providers active | ≥10 |
| E2E test scenario passes | ✅ |
| Legal review complete | ✅ |
| SSL configured | ✅ |
| Error tracking (Sentry) live | ✅ |
| Mobile UX tested on real devices | ✅ |
| Admin can verify/block | ✅ |

### Month 1

| Metric | Target |
|--------|--------|
| Published requests | ≥50 |
| Request fulfillment rate (≥1 offer in 10 min) | ≥40% |
| Completed orders | ≥10 |
| Active providers (online ≥2h/day) | ≥15 |

### Month 3

| Metric | Target | Kill Threshold |
|--------|--------|---------------|
| Weekly requests | ≥50 | <10 |
| Request fulfillment rate | ≥60% | <30% |
| Completion rate | ≥70% | <40% |
| Weekly active providers | ≥25 | <10 |
| Time to first offer (median) | <5 min | >15 min |
| Customer repeat rate | ≥15% | <5% |

---

## Development Timeline (revised)

| Phase | Duration | Cumulative |
|-------|----------|-----------|
| Foundation + Auth | 4 days | Day 4 |
| Provider + Request + Vehicle | 4 days | Day 8 |
| Matching + Notifications + SSE | 3 days | Day 11 |
| Offers + Selection + Order Lifecycle | 4 days | Day 15 |
| Rating + Admin + Polish | 3 days | Day 18 |
| E2E testing + Bug fixing | 2 days | Day 20 |
| **Total to deployable MVP** | **~20 working days (4 weeks)** | |

This is aggressive but achievable for a focused full-time developer with clear specs.

**Buffer:** Add 30-50% for unexpected complexity → **6 weeks** realistic.

**Parallel founder work during development:**
- Weeks 1-2: Provider outreach and recruitment
- Weeks 3-4: Provider onboarding onto platform
- Weeks 5-6: Pilot testing with seeded requests
