# CARFIX — MARKETPLACE AUDIT

**Date:** 2026-09-09  
**Status:** Pre-Implementation Marketplace Analysis

---

## 1. Supply Acquisition

### Current State: ZERO

No provider has been contacted. No provider has agreed to use the platform. This is the #1 existential risk.

### Strategy Assessment

The planned strategy — manually onboard 50-80 providers from 2GIS listings — is correct in approach but has unstated assumptions:

| Assumption | Why Important | How to Validate | Success Threshold | Failure Signal |
|-----------|--------------|-----------------|-------------------|----------------|
| 200+ auto electricians exist in Astana | Large enough pool | Count 2GIS listings | >150 listings | <50 listings |
| 20%+ will agree to try a free platform | Sufficient early adoption | Cold outreach to 50 | >10 sign up | <5 sign up |
| Providers can use a web app on their phone | Technology adoption | In-person demo with 5 | >3 successfully use it | <2 can use it |
| Providers will keep the app "on" while working | Always-available supply | Monitor provider online hours | >4 hours/day average | <1 hour/day |
| Providers will respond to notifications within 10 min | Real-time value proposition | Pilot test with notifications | >50% respond in 10 min | <20% respond in 10 min |
| Mobile auto electricians have unused capacity | Supply elasticity exists | Interview 10 providers | >60% report idle time | <30% report idle time |
| Providers will use the platform long-term without payment | Sustained engagement | Track retention over 1 month | >50% still active after 30 days | <20% active after 30 days |

### Missing in Current Plan

1. **Telegram bot as backup notification channel.** Many providers in Kazakhstan use Telegram more actively than browser apps. A Telegram notification ("Новая заявка рядом! Откройте CarFix") may get higher response rates than PWA push.

2. **Provider referral.** Each onboarded provider probably knows 5-10 other mechanics. "Привлеките коллегу — получите приоритет в заявках" (Refer a colleague — get priority in requests). Not monetary incentive, but positioning incentive.

3. **Provider groups/communities.** Auto electricians in Astana probably have WhatsApp or Telegram groups. Getting the CarFix link shared in those groups is more effective than cold calling.

---

## 2. Demand Acquisition

### Current State: ZERO (and not addressed in documents)

The existing documents have no customer acquisition plan at all. They describe the product and hope customers will come.

### Channels to Evaluate

| Channel | Cost | Expected Volume | Timing |
|---------|------|----------------|--------|
| **Provider-led** ("Найди меня на CarFix") | Free | Low but high-quality | From Day 1 |
| **Telegram groups** (car owner groups in Astana) | Free | Medium | From Day 1 |
| **Instagram ads** (Astana geo-targeted) | 50-200K KZT/month | Medium | After 10+ providers active |
| **Google/Yandex ads** ("автоэлектрик Астана") | Variable | Medium-High (intent-based) | After product works |
| **2GIS listing** (list CarFix as a service) | Free or low | Low-Medium | After launch |
| **Physical stickers** at gas stations, parking lots | Low | Very low but brand awareness | After product works |
| **Word of mouth** (satisfied customers) | Free | Slow but highest trust | After 20+ completed orders |
| **Car dealership partnerships** | Free/barter | Low but targeted | Phase 2 |

### Critical Insight

**Do not spend money on demand acquisition until supply is reliable.** If a customer comes from an Instagram ad and gets zero responses, that's worse than not having the customer at all. Supply must come first.

---

## 3. Liquidity

### Definition

A marketplace is "liquid" when a request reliably receives at least one relevant response in a reasonable timeframe.

### Liquidity Requirements for CarFix Astana

| Metric | Minimum Viable | Target | Measurement |
|--------|---------------|--------|-------------|
| Simultaneously active providers | 15 | 30+ | Real-time dashboard |
| Time to first offer | <10 min | <5 min | Event tracking |
| Request fulfillment rate | >50% | >70% | requests_with_offers / published_requests |
| Geographic coverage | Core Astana (3 districts) | Full Astana | Provider location heatmap |
| Category coverage | Electrical + battery | Electrical + battery + mechanic + tire | Provider specialization distribution |
| Provider hours of operation | 8:00-20:00 | 7:00-23:00 | Online time tracking |

### Liquidity Death Spiral

```
Low supply density
        ↓
Customer request gets no response
        ↓
Customer leaves, never returns
        ↓
Provider sees no customer activity
        ↓
Provider stops checking the app
        ↓
Even lower supply density
        ↓
MARKETPLACE DEAD
```

**Prevention:**
1. Do not launch until supply is confirmed
2. Seed requests if organic demand is slow
3. Founder monitors EVERY request during first month
4. Call providers personally if they don't respond to test requests
5. Track fulfillment rate daily — if it drops below 40%, pause demand acquisition

---

## 4. Matching

### Current Design: CORRECT

The matching algorithm is deterministic and well-specified:
```
online = true
AND specialization matches category
AND ST_DWithin(location, request_location, radius)
AND location_updated_at > NOW() - INTERVAL '30 minutes'
```

This is the right approach. Do not add machine learning, recommendation engines, or complex ranking to matching at MVP stage.

### Ranking (after filtering)

The current plan: order by distance ASC. This is acceptable.

**Future improvement:** Weight by:
1. Distance (shorter = better)
2. Response speed history (faster responders first)
3. Rating (higher = better)
4. Completion rate (higher = better)

But this requires data that doesn't exist yet. Distance-only sorting is correct for MVP.

### Radius Expansion: CORRECT

```
0-3 min: 5 km
3-6 min: 10 km  
6-10 min: 20 km
10+ min: "No providers available"
```

**One improvement:** Show the customer progress: "Ищем мастеров в радиусе 5 км..." then "Расширяем поиск до 10 км..." — this manages expectations and demonstrates that the system is actively working.

---

## 5. Provider Response

### Expected Response Rate: 15-25%

Based on marketplace benchmarks (inDrive, Uber), the expected response rate for provider notifications is 15-25% in a healthy marketplace. This means:
- If 10 providers are notified → 1.5-2.5 will respond
- This is sufficient for the customer to get at least 1 offer
- But requires notifying enough providers in the first place

### Response Rate Drivers

| Driver | Impact | How to Improve |
|--------|--------|---------------|
| Notification clarity | High | Show category + distance in notification |
| Notification speed | High | <5 seconds from publish to notification |
| Provider proximity | High | Closer providers respond more |
| Time of day | Medium | Morning/afternoon better than night |
| Job attractiveness | Medium | Higher estimated value → higher response |
| Provider app fatigue | Medium | Don't over-notify (max 10/day) |
| Provider trust in platform | High | Early providers need personal relationship with founder |

---

## 6. Customer Conversion

### Expected Funnel

```
100 customers visit app
        ↓ 40% create account
40 registered users
        ↓ 50% create request
20 published requests
        ↓ 60% receive offers (target)
12 requests with offers
        ↓ 70% select a provider
8 accepted offers
        ↓ 80% complete service
6-7 completed orders
```

**100 visitors → 6-7 completed orders = 6-7% conversion**

This is optimistic. Real marketplace conversion is often 2-5%. The key bottleneck is step 3 (receiving offers) — entirely dependent on supply density.

---

## 7. Repeat Usage

### Challenge

Automotive emergencies are rare (1-3x per year). This means:
- Low repeat rate by nature of the category
- Must find ways to increase frequency or breadth of use

### Frequency Expansion Path

| Phase | Categories | Expected Frequency |
|-------|-----------|-------------------|
| MVP | Electrical, battery, emergency | 1-3x/year |
| Phase 2 | + Tire, towing | 2-5x/year |
| Phase 3 | + Regular maintenance, oil change | 4-8x/year |
| Phase 4 | + Body repair, diagnostics | 5-10x/year |

**Key insight:** The MVP category (emergencies) has the lowest frequency but highest urgency. This is correct for marketplace launch (high willingness to use a new platform) but means the business must expand categories to achieve retention.

---

## 8. Disintermediation

### Risk Level: HIGH (but acceptable for MVP)

After one successful transaction, provider and customer have each other's phone number. Rational behavior: call directly next time.

### Why It's Not Fatal for MVP

1. Emergencies are unpredictable — your saved mechanic may be unavailable
2. CarFix provides CHOICE — multiple offers with price competition
3. Different emergencies need different specialists
4. The value of rating/reputation only exists on-platform

### Long-Term Anti-Disintermediation

| Mechanism | When | Impact |
|-----------|------|--------|
| Continuous new customer flow for providers | Day 1 | High |
| Rating/reputation portability | Day 1 | Medium |
| Price competition (multiple offers) | Day 1 | High |
| Service history for customer | Phase 7 | Medium |
| In-app payments (convenience) | Phase 10+ | High |
| Warranty/guarantee recording | Phase 10+ | Medium |
| Loyalty program | Year 2+ | Medium |

**MVP position:** Do NOT try to prevent phone number exchange. It's unenforceable and alienates both sides. Focus on making the platform the most reliable way for providers to get new customers.

---

## 9. Trust

### Trust Chain

```
Customer trusts platform
        → Platform verifies provider
                → Provider profile (name, photo, specializations)
                → Provider rating (from previous customers)
                → Provider completed jobs count
                → Provider verified badge (if credentials checked)
```

### Trust Gaps in Current Plan

| Gap | Severity | Mitigation |
|-----|----------|-----------|
| New providers have zero ratings | High | Show "Новый мастер" badge, limit to safe categories |
| No guarantee of service quality | High | Rating system + report mechanism |
| Provider credential verification is manual | Medium | Acceptable for MVP, automated later |
| No insurance / warranty | Medium | Out of scope for MVP, note in user agreement |
| Customer can't verify provider identity pre-arrival | Medium | Show provider photo + name + vehicle in order details |
| No background checks | Medium | `LEGAL REVIEW REQUIRED` — may be required for some categories |

---

## 10. Geographic Density

### Astana City Analysis

| District | Population | Vehicle Density | Provider Density (est.) | Priority |
|----------|-----------|----------------|----------------------|----------|
| Saryarka | ~350K | High | Medium-High | **Primary** |
| Almaty | ~300K | High | High | **Primary** |
| Baykonyr | ~200K | Medium | Medium | Secondary |
| Esil | ~150K | Medium-High | Medium | Secondary |
| Nura | ~100K | Low | Low | Later |
| Other | ~500K | Variable | Low | Later |

### Minimum Coverage

- **Phase 1:** Saryarka + Almaty districts (~8 km x 8 km area)
- **Phase 2:** + Baykonyr + Esil
- **Phase 3:** Full Astana

With a 5 km service radius per provider:
- Saryarka + Almaty = ~150 km² area
- ~78 km² per provider coverage circle
- **Minimum 2-3 providers simultaneously online** for basic coverage
- **Target 10-15 simultaneously online** for reliable response times

---

## Critical Marketplace Assumptions

### The 20 Assumptions That Must Be True

| # | Assumption | Category | Testable Before Launch? |
|---|-----------|----------|----------------------|
| 1 | Auto electricians in Astana have unused capacity | Supply | ✅ Interview |
| 2 | They will join a free platform | Supply | ✅ Outreach |
| 3 | They will keep the app open/notifications enabled | Supply | ✅ Pilot test |
| 4 | They will respond within 10 minutes | Supply | ✅ Pilot test |
| 5 | They will provide honest pricing | Supply | ⚠️ Partially (track post-completion) |
| 6 | They will show up after accepting | Supply | ⚠️ Track no-show rate |
| 7 | Car owners experience urgent problems frequently enough | Demand | ✅ Market data |
| 8 | They will use a web app instead of calling 2GIS | Demand | ⚠️ Need real users |
| 9 | They will trust an unknown provider from the app | Demand | ⚠️ Track acceptance rate |
| 10 | They will wait 5-10 minutes for offers | Demand | ⚠️ Track abandonment |
| 11 | 5 km radius is sufficient for Astana core | Geography | ✅ Map analysis |
| 12 | PWA push notifications are reliable on Android in KZ | Technology | ✅ Test on real devices |
| 13 | 3G connection is sufficient for core flow | Technology | ✅ Test on throttled connection |
| 14 | PostGIS matching is fast enough (<100ms) | Technology | ✅ Load test |
| 15 | Multiple offers create more value than a single match | Market design | ⚠️ Compare conversion rates |
| 16 | Price transparency is valued by customers | Value prop | ⚠️ Post-order survey |
| 17 | Ratings will be submitted by both parties | Trust | ⚠️ Track rating completion rate |
| 18 | Provider retention is sustainable without payment | Retention | ❌ Only measurable after 3 months |
| 19 | Customer retention exists (repeat usage) | Retention | ❌ Only measurable after 6 months |
| 20 | The market is large enough to sustain a business | Market size | ❌ Only measurable after 6-12 months |
