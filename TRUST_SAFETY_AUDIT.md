# CARFIX — TRUST & SAFETY AUDIT

**Date:** 2026-09-09  
**Status:** Pre-Implementation

---

## 1. Provider Trust Model

### Current: Binary (verified / unverified)

The existing PRODUCT.md defines a simple model: provider uploads credentials → admin reviews → verified badge.

### Required: Three-tier model

| Level | Name | Requirements | Allowed Categories | Restrictions |
|-------|------|-------------|-------------------|-------------|
| **3** | Новый мастер (New Provider) | Phone verified, profile complete, photo | Battery/jump-start, basic diagnostics only | Limited visibility, "Новый" badge, max 5 active offers |
| **2** | Проверенный мастер (Verified Independent) | Level 3 + credential document reviewed + admin approval | All non-safety-critical categories | Standard visibility, "Проверенный" badge |
| **1** | Проверенный сервис (Verified Service/СТО) | Level 2 + business registration (ИП/ТОО) verified + physical address confirmed | All categories including safety-critical | Premium visibility, "Проверенный сервис" badge |

### Safety-Critical Work Categories

These categories should require Level 1 or Level 2 verification:

| Category | Risk Level | Minimum Provider Level |
|----------|-----------|----------------------|
| Brakes | Critical | Level 1 only |
| Steering | Critical | Level 1 only |
| Suspension (critical elements) | Critical | Level 1 only |
| Airbag / SRS systems | Critical | Level 1 only |
| Fuel system | High | Level 1 or 2 |
| Engine internal | High | Level 1 or 2 |
| Electrical (starting/battery) | Medium | Level 2 or 3 |
| Battery / jump-start | Low | Level 3 (any) |
| Tire change | Low | Level 3 (any) |
| Diagnostics (scan only) | Low | Level 3 (any) |

**For MVP:** Since the initial categories are electrical/starting and battery (all low/medium risk), Level 3 providers can participate immediately. But the **architecture must enforce category-level access control from Day 1**.

---

## 2. Provider Verification Process

### MVP Process

```
1. Provider creates account (phone + OTP)
2. Provider fills profile (name, photo, experience)
3. Provider selects specializations
4. Provider uploads credential document (ИП certificate, trade license, or portfolio)
5. Provider appears as "На проверке" (Under review)
6. Admin reviews document manually
7. Admin approves → Level 2 (Verified Independent)
   Admin rejects → Provider notified with reason
8. For Level 1: Admin additionally verifies business registration
```

### Scalability

This manual process works for 0-100 providers. For 100-500 providers, consider:
- Automated ИП verification via eGov.kz API (if available)
- Crowd-sourced verification (verified providers vouch for new ones)
- Tiered auto-approval for low-risk categories

### `LEGAL REVIEW REQUIRED`

- What constitutes sufficient "credential verification" under Kazakhstan law?
- Does the platform have liability for service quality of "verified" providers?
- What disclaimers must be presented to users?

---

## 3. Customer Safety

### Pre-Selection Safety

| Safeguard | Description | MVP Status |
|-----------|-------------|-----------|
| Provider photo requirement | Provider must upload a real photo | ✅ Build |
| Provider name display | Full name (or business name) visible | ✅ Build |
| Provider rating visible | Historical ratings from other customers | ✅ Build (Phase 7) |
| Provider verification badge | Visual indicator of verification level | ✅ Build |
| Distance display (not exact location) | Customer sees "3.2 km" not provider's GPS | ✅ Build |

### Post-Selection Safety

| Safeguard | Description | MVP Status |
|-----------|-------------|-----------|
| Phone number exchange | Both parties see each other's number after acceptance | ✅ Build |
| Provider identity visible | Customer sees who is coming (photo + name + vehicle if provided) | ✅ Build |
| Report button | One-tap "Report a problem" → immediate email to admin | ✅ Build |
| Order audit trail | All status transitions timestamped | ✅ Build |
| Cancellation option | Customer can cancel at any stage | ✅ Build |

### Missing (Future)

| Safeguard | Description | Phase |
|-----------|-------------|-------|
| Emergency contact sharing | Share order details with trusted contact | Phase 2 |
| Live location sharing (optional) | Customer shares location with trusted contact | Phase 3 |
| In-app call masking | Calls routed through platform number | Not MVP |
| Background checks | Criminal record check for providers | `LEGAL REVIEW REQUIRED` |
| Insurance verification | Provider's liability insurance | Phase 3+ |

---

## 4. Provider Safety

Providers also face risks:

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Customer no-show | Medium | Customer rating system. No-show counter. |
| Fake request (waste of time) | Medium | Require verified phone. Track cancellation rate. |
| Payment dispute | High | Record agreed price. Rating mentions pricing. |
| Physical threat | Low | Provider can cancel order at any time. Report button. |
| Scope creep ("while you're here, also fix this...") | High | Offer specifies scope. Final price recorded. |

---

## 5. Platform Trust Mechanisms

### Rating System Design

| Aspect | Design |
|--------|--------|
| Scale | 1-5 stars |
| Direction | Bidirectional (customer ↔ provider) |
| Timing | Prompted after order COMPLETED |
| Required | Optional but prompted |
| Text review | Optional |
| Visibility | Provider rating public. Customer rating visible to providers. |
| Aggregation | Simple average |
| Minimum reviews for display | Show after 1 rating, but with "(1 отзыв)" label |
| Fake review prevention | Only from completed orders. One rating per user per order. |

### Rating Abuse Prevention

| Attack | Prevention |
|--------|-----------|
| Provider creates fake customer accounts to rate themselves | UNIQUE phone number per account. Rate-limit registrations per phone. |
| Customer threatens low rating to get discount | Record all offers and agreed prices. Pattern detection (future). |
| Provider bribes for 5-star ratings | Undetectable at MVP scale. Monitor for suspicious patterns. |
| Retaliatory low ratings | Both ratings submitted before either is visible (blind rating). |

### Blind Rating Implementation

Important: Neither party sees the other's rating until BOTH have submitted (or 48 hours have passed, whichever comes first). This prevents retaliatory ratings.

---

## 6. Dispute Resolution

### MVP Dispute Flow

```
Customer taps "Проблема с заказом" (Problem with order)
        ↓
Select issue type:
  - Мастер не приехал (Provider didn't show up)
  - Качество работы (Service quality)
  - Несогласие по цене (Price disagreement)
  - Повреждение автомобиля (Vehicle damage)
  - Другое (Other)
        ↓
Free text description + optional photo upload
        ↓
Email sent to admin with full order details
        ↓
Admin reviews and takes action:
  - Refund coordination (manual, off-platform)
  - Provider warning
  - Provider suspension
  - Rating adjustment
  - No action
```

### Dispute Triggers

| Trigger | Expected Frequency | Severity |
|---------|-------------------|----------|
| Price higher than quoted | High (20-30% of orders) | Medium |
| Provider didn't show up | Medium (5-10%) | High |
| Work quality complaint | Low-Medium (5-10%) | High |
| Vehicle damage claim | Very low (<1%) | Critical |
| Safety concern | Very low (<1%) | Critical |

### Price Dispute Handling

The most common dispute. Mitigation:
1. Record the agreed price in the offer
2. Record the final price at completion
3. If final price > agreed price + 20%, flag for review
4. Show customer: "Цена изменилась с 8,000 ₸ до 12,000 ₸. Подтвердить?"

---

## 7. Data Privacy

### Kazakhstan Law Requirements

Kazakhstan's "Law on Personal Data and Their Protection" (effective 2013, updated 2020+) requires:

| Requirement | Compliance Plan |
|-------------|----------------|
| User consent for data collection | Consent checkbox during registration |
| Purpose limitation (data used only for stated purpose) | Privacy policy specifying data use |
| Data minimization | Collect only necessary data |
| Data subject rights (access, correction, deletion) | Admin tool for data export/deletion |
| Data protection officer | Not required for small companies |
| Cross-border data transfer restrictions | Host data in Kazakhstan or CIS |
| Breach notification | Process TBD |

### `LEGAL REVIEW REQUIRED`

- Privacy policy template for Kazakhstan marketplace
- User agreement (public offer)
- Consent mechanism for geolocation tracking
- Photo/video data processing consent
- Data retention policy
- Cross-border data transfer implications (if hosting outside KZ)

### Platform Privacy Rules

| Data | Visible to Customer | Visible to Provider | Visible to Admin |
|------|--------------------|--------------------|-----------------|
| Customer phone | ❌ Before acceptance, ✅ After acceptance | ❌ Before acceptance, ✅ After acceptance | ✅ Always |
| Customer location (exact) | Self | ❌ Before acceptance, ✅ After acceptance | ✅ Always |
| Customer location (distance only) | Self | ✅ Always | ✅ Always |
| Provider phone | ❌ Before acceptance, ✅ After acceptance | Self | ✅ Always |
| Provider location (exact) | ❌ Never (only distance) | Self | ✅ Always |
| Provider credentials | ❌ Never | Self | ✅ Always |
| Order details | Only own orders | Only own orders | ✅ All orders |
| Ratings given | Public (after both submit) | Public (after both submit) | ✅ Always |

---

## 8. Moderation

### Content Moderation Needs

| Content Type | Risk | MVP Approach |
|-------------|------|-------------|
| Provider profile text | Low (short, factual) | Post-moderation (admin flag) |
| Request descriptions | Low (usually short, problem-focused) | No moderation needed |
| Offer messages | Low (short, professional) | No moderation needed |
| Rating comments | Medium (potential abuse) | Post-moderation (admin flag) |
| Photos (request) | Low-Medium | MIME type validation only. No content analysis. |
| Provider photos | Medium (fake/inappropriate) | Manual review during verification |

### Blocking/Suspension

| Action | Trigger | Actor | Duration |
|--------|---------|-------|----------|
| Warning | First minor violation | Admin | Permanent record |
| Temporary suspension | Second violation or first serious violation | Admin | 7-30 days |
| Permanent ban | Critical safety issue or repeated violations | Admin | Permanent |
| Auto-suspend | 3+ no-shows in 30 days | System | Until admin review |
| Auto-suspend | Rating drops below 2.0 with 5+ ratings | System | Until admin review |

---

## 9. Incident Response (MVP)

### For the founder/admin during first 3 months:

| Incident | Response Time | Action |
|----------|-------------|--------|
| Customer reports safety concern | <1 hour | Call customer, suspend provider, investigate |
| Customer reports vehicle damage | <2 hours | Call both parties, document, coordinate |
| Provider reports customer threat | <1 hour | Call provider, flag customer account |
| Price dispute | <24 hours | Review order details, mediate |
| Quality complaint | <24 hours | Review ratings, contact provider |
| Technical outage | <30 minutes | Check server, restart if needed |

### Admin notification setup

- Email alerts for: all disputes, all reports, all 1-star ratings
- Daily summary: orders completed, disputes opened, provider registrations
- Real-time dashboard: active providers, pending requests, current orders

---

## Summary

The trust & safety model needs significant strengthening before launch:

1. ✅ **Add provider tiers** (3 levels with category restrictions)
2. ✅ **Add blind rating** (both submit before either sees)
3. ✅ **Add dispute flow** (simple report → admin email)
4. ✅ **Add safety-critical category restrictions**
5. ⚠️ **`LEGAL REVIEW REQUIRED`** for provider liability, user agreements, data privacy
6. ⚠️ **Add price change flagging** (final price vs. agreed price)
7. ⬜ **Defer:** background checks, insurance verification, in-app call masking
