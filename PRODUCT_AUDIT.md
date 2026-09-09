# CARFIX — PRODUCT AUDIT

**Date:** 2026-09-09  
**Status:** Pre-Implementation Audit

---

## 1. What problem are we solving?

**Fragmented discovery under time pressure.** When a car breaks down or won't start, the owner needs a qualified provider NOW. The current experience involves calling multiple numbers from 2GIS, hoping someone answers, hoping they're close enough, and having no idea about pricing until the provider names a number.

The specific pain: "I need help right now, and I don't know who is available, nearby, qualified, and how much they'll charge."

**Clarity: STRONG.** This is a real, specific, recurring problem.

---

## 2. For whom?

**Demand:** Car owners in Astana who don't have a trusted mechanic on speed-dial.
- Most acute for: night/weekend breakdowns, newer residents, people with uncommon vehicle brands.
- Estimated addressable: ~400K vehicle owners in Astana.

**Supply:** Independent mobile auto electricians, mobile mechanics, and (eventually) СТО, tire services, tow trucks.
- Estimated initial supply pool: 200-500 auto electricians/mobile mechanics in Astana (based on 2GIS listing density).

**Clarity: STRONG.** Clear two-sided market with identifiable participants.

---

## 3. Why now?

**FOR:**
- Smartphone penetration in Kazakhstan is >90%
- inDrive has trained users on the request-broadcast model
- Kolesa.kz and 2GIS dominate discovery but are passive directories — no one does real-time matching
- Auto repair market is large and completely offline
- GService.kz exists but focuses on equipment/B2B — not consumer repair matching

**AGAINST:**
- No urgency driver (no regulatory change forcing digitization)
- Kolesa.kz has a services section and could add matching features at any time
- The market has existed for years without a dominant matching solution — this might mean the problem isn't painful enough, or it might mean the timing is finally right

**Assessment: MODERATE.** No strong "why now" catalyst, but the competitive gap is real.

---

## 4. Why this product?

**Positioning: "inDrive for car problems"**

The user creates ONE request → multiple providers see it → providers compete with offers → customer chooses based on price, ETA, rating.

This is NOT:
- A directory (2GIS, Kolesa.kz) — those require the customer to search and call
- A subscription service (LiTRO) — CarFix has no upfront commitment
- A towing-only app (Evakuator.kz) — CarFix covers all automotive services
- An AI product — AI is a feature, not the product

**Differentiation: CLEAR.** Real-time competitive matching vs. passive listing.

---

## 5. Why would users switch from OLX / 2GIS / WhatsApp?

| Current Solution | CarFix Advantage |
|-----------------|-----------------|
| 2GIS (search → call) | No calling. One request reaches many providers. Price comparison before commitment. |
| Kolesa.kz (directory) | Same as 2GIS advantage + real-time availability data |
| WhatsApp groups | Structured requests. Accountability. Ratings. Price transparency. |
| Ask friends | Works when you have friends who know mechanics. Doesn't work in unfamiliar districts. |
| LiTRO | No subscription. More providers. Price competition. |

**Key risk:** The switching cost is low in both directions. Users can easily go back to calling from 2GIS if CarFix's response rate is poor. First impressions matter enormously.

---

## 6. Why would providers join?

**The value proposition: "More paying customers without marketing effort."**

For an independent auto electrician who currently gets 2-4 customers/day from 2GIS listings:
- CarFix sends customers directly to their phone
- No marketing spend required
- Free to join (MVP)
- Clear job descriptions (they know what tools to bring)

**Risk:** Providers are notoriously difficult to onboard in marketplaces. They're busy working, not downloading apps. The founder must do in-person onboarding. No amount of app-store optimization or Instagram ads will recruit the first 20 providers.

---

## 7. What is the strongest wedge?

**Urgent Electrical / Starting Problems** (car won't start, dead battery, electrical failure)

Why:
- Highest urgency = highest willingness to try a new platform
- Mobile auto electricians are already mobile (they come to you) — perfect for request-response model
- Battery/jump-start is the simplest service to match (low specialization variance)
- "Car won't start" is the #1 roadside issue
- These providers are fragmented across 2GIS and WhatsApp — no aggregator exists

**Assessment: CORRECT.** This is the right wedge.

---

## 8. What is the weakest assumption?

**"Providers will respond to phone notifications within 5 minutes."**

This assumption underpins the entire real-time value proposition. If providers:
- Have their phone on silent while working
- Forget to check the app
- Are already busy with a customer
- Don't understand the notification
- Ignore it because they're not sure it's a real job

...then the customer gets no response, concludes the app is dead, and never returns.

**How to test:** Recruit 5 providers. Send test requests during business hours. Measure actual response time and response rate.

**Kill signal:** If <30% of test notifications get a response within 10 minutes, the notification strategy needs fundamental rethinking (e.g., Telegram bot instead of PWA push, or phone call fallback).

---

## 9. What is the MVP?

**Minimum loop:**
1. Customer opens app, selects category, confirms location → publishes request (2 taps after login)
2. Matching engine finds nearby online providers with matching specialization
3. Providers get notified → see request card → submit offer (price, ETA)
4. Customer sees offers in real-time → selects one
5. Order created → provider completes work → customer confirms → both rate

**Everything else is enhancement.**

---

## 10. What should NOT be built?

| Feature | Reason |
|---------|--------|
| AI problem classification | Manual category selection works. AI is Phase 8. |
| Photo-based damage estimation | Unreliable, liability risk, complex ML. Not MVP. |
| In-app payments | Cash/Kaspi transfer is fine. Payments add massive complexity. |
| Chat between users | Structured offers replace chat. Chat adds moderation burden. |
| Native iOS/Android apps | PWA first. Native if PWA push fails. |
| Real-time provider location tracking | Privacy concern + battery drain. ETA is sufficient. |
| Recommendation engine | No data to train on. Distance + rating sorting is enough. |
| Multi-city | Astana first. Period. |
| Multi-language | Russian only. Strings externalized for future. |
| Provider subscription / premium tiers | Free during bootstrapping. |
| Parts marketplace | Completely separate business. |
| Insurance integration | Years away. Legal partnerships required. |
| Fleet management | B2B feature. Not MVP. |
| Desktop app | Zero justification. |
| Complex CRM / analytics platform | Admin panel with basic queries is sufficient. |

---

## Critical Product Risk: First Impression

A marketplace gets one chance to make a first impression. If a motorist's first request gets zero responses, they will:
1. Delete the app
2. Tell friends "it doesn't work"
3. Go back to 2GIS
4. Never return

**Therefore: DO NOT launch publicly until 10+ providers are reliably active during business hours.**

Controlled launch:
1. Onboard 15-20 providers
2. Run 20 seeded test requests
3. Measure fulfillment rate
4. Only then: limited public marketing in pilot zones (Saryarka, Almaty districts)
