# CARFIX — TRUST, SAFETY & VERIFICATION AUDIT

**Version:** 2.1 (Pre-Implementation P0 Corrections)  
**Date:** 2026-09-09  
**Status:** Canonical & Implementation-Ready  
**Market:** Astana, Kazakhstan

---

## 1. The Core Trust Challenge in Automotive Marketplaces

Unlike ridesharing or food delivery, automotive repair involves high financial stakes and safety-critical physical systems. A marketplace cannot operate on the principle that "anyone with a wrench can service brakes."

---

## 2. Three Canonical Provider Verification Levels

```
┌────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: VERIFIED SERVICE (СТО / Автосервис)                           │
│ - Verified business registration (БИН / ТОО / ИП)                      │
│ - Verified physical workshop address in Astana                         │
│ - Documented equipment and diagnostic capabilities                     │
│ - Access: All categories (including future complex shop repairs)       │
└────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ Upgrade on Document Check
┌───────────────────────────────────┴────────────────────────────────────┐
│ LEVEL 2: VERIFIED MASTER (Независимый мастер / Выездной специалист)    │
│ - Verified identity (ИИН / Удостоверение личности)                    │
│ - Verified tax registration (ИП на патенте / упрощенке)                │
│ - Verified professional experience & tool inspection                   │
│ - Access: 3 MVP categories (Auto-Electric, Jumpstart, Minor Mechanic)  │
└────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ Upgrade after 5 positive jobs
┌───────────────────────────────────┴────────────────────────────────────┐
│ LEVEL 3: NEW PROVIDER (Новый исполнитель на платформе)                 │
│ - Phone number verified, profile created                               │
│ - Pending admin identity & credential review                           │
│ - Access: Non-safety-critical roadside assistance only                 │
│ - STRICTLY BLOCKED from safety-critical repairs                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Strict Safety-Critical Category Exclusions for MVP

To protect consumer safety and reduce platform liability, the `mobile_mechanic` category in MVP is strictly limited to **minor non-safety-critical roadside mechanical assistance** (drive belts, hoses, spark plugs, fluid top-up).

The following categories are **strictly EXCLUDED** from MVP:
- **Brakes:** Brake pads, discs, lines, master cylinders.
- **Steering:** Steering rack, tie rods, power steering systems.
- **Critical Suspension:** Ball joints, control arms, strut assemblies.
- **Airbags / SRS:** Supplementary restraint systems, pyrotechnic pretensioners.
- **High-Pressure Fuel Systems:** Fuel injectors, high-pressure pumps.

Any future introduction of safety-critical categories requires a mandatory verification gate (Level 1 or Level 2 only). Level 3 providers are permanently barred from safety-critical tasks.

---

## 4. Anti-Fraud & Reputation Integrity

1. **Bidirectional Reviews with Integrity Constraints:**
   - Both customer and provider can submit 1 review per completed order.
   - Database constraint: `UNIQUE(order_id, from_user_id)`.
   - Integrity guards: `CHECK(from_user_id <> to_user_id)` and `CHECK(rating >= 1 AND rating <= 5)`.
   - Reviews can only be submitted when `order.status = 'COMPLETED'`.
2. **Dispute Arbitration:**
   - When a price disagreement occurs after on-site diagnosis, the customer can open a dispute (`DISPUTED` state).
   - An administrator arbitrates through the `/admin` interface with full audit logging.
3. **Contact Privacy Guard:**
   - Customer phone number and exact coordinates are masked from providers until an offer is formally accepted.
