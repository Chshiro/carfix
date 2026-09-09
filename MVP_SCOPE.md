# CARFIX — CANONICAL MVP SCOPE DEFINITION

**Version:** 2.0 (Canonical Consistency Pass)  
**Date:** 2026-09-09  
**Status:** Approved & Frozen for Implementation  
**Geography:** Astana, Kazakhstan (Pilot: Esil & Almaty Districts)

---

## 1. The One-Sentence MVP

> A mobile-first web app where a car owner in Astana describes an emergency breakdown in 2 steps, eligible nearby auto specialists receive instant alerts via Web and Telegram, submit transparent price bids, and complete on-site assistance with verified ratings.

---

## 2. Canonical MVP Categories (Strictly 3)

| Category Slug | Human Title | Description | Target Use Case |
|---|---|---|---|
| `electrical_starting` | Автоэлектрика и запуск | Компьютерная диагностика, стартер, генератор, проводка | Автомобиль не заводится, щелкает реле, ошибки на панели |
| `battery_jumpstart` | Аккумулятор и прикурка | Прикурка 12V/24V, доставка и замена АКБ, чистка клемм | Разряжен аккумулятор на стоянке / во дворе (топ зимой в Астане) |
| `mobile_mechanic` | Мелкий выездной ремонт | Замена ремня, патрубка, свечей, навесного оборудования | Мелкая поломка на месте без необходимости подъемника |

*(Шиномонтаж, эвакуаторы, кузовной ремонт, покраска и сложный агрегатный ремонт официально отложены на Post-MVP фазу).*

---

## 3. Explicit Feature Matrix: In-Scope vs. Out-of-Scope

### 3.1 Customer Experience
- [x] **IN-SCOPE:**
  - Phone OTP registration & authentication.
  - 2-step Request creation (Category + Location via GPS/Pin + Optional Description + Optional 1–3 photos).
  - Optional Vehicle selection (can request help without pre-registering a car).
  - Real-time Offer comparison feed (Provider photo, rating, distance, pricing mode, ETA).
  - 1-tap Provider selection with atomic locking.
  - Direct Call & WhatsApp contact buttons upon selection.
  - Active order status tracking (`EN_ROUTE` → `ARRIVED` → `IN_PROGRESS` → `COMPLETED`).
  - Order completion confirmation, final price verification, and 1–5 star rating submission.
  - Request / Order history.
- [ ] **OUT-OF-SCOPE (Deferred):**
  - In-app payment processing (initial transactions are paid direct via Kaspi QR / cash).
  - In-app text chat (phone call and WhatsApp handle communication).
  - Live GPS car tracking on moving map (status badges are sufficient).
  - Native iOS/Android apps (responsive PWA only).
  - AI photo damage estimation (deferred post-validation).

### 3.2 Provider Experience
- [x] **IN-SCOPE:**
  - Phone OTP registration & profile setup.
  - Provider capability & service mode configuration.
  - Verification document upload (ИП, ID certificate).
  - Online/Offline availability toggle with GPS coordinate capture and 4-hour auto-offline protection.
  - Web & Telegram Bot lead alerts with inline bidding (`Fixed`, `Diagnostic Fee`, `Range`).
  - Active order status updater (`[В пути]`, `[На месте]`, `[Начал работу]`, `[Завершил]`).
  - Completed jobs and aggregate rating summary.
- [ ] **OUT-OF-SCOPE (Deferred):**
  - Subscription billing or automatic commission deduction.
  - Complex calendar scheduling (MVP is for immediate / on-demand requests).
  - Multi-employee team dispatching (individual technician flow only).

### 3.3 Operations & Trust (Admin)
- [x] **IN-SCOPE:**
  - Admin login with dedicated role authorization.
  - Provider verification queue: review documents and assign trust levels:
    - `LEVEL_1_VERIFIED_SERVICE` (СТО)
    - `LEVEL_2_VERIFIED_MASTER` (Независимый мастер)
    - `LEVEL_3_NEW_PROVIDER` (Новый исполнитель)
  - Safety-critical category enforcement gate.
  - Real-time inspector for all live requests and orders across Astana.
  - Dispute resolution workflow for price or quality disagreements.
  - User and provider suspension / blocking with immutable audit logs.
- [ ] **OUT-OF-SCOPE (Deferred):**
  - Advanced BI analytics dashboards.
  - Automated payout systems.

---

## 4. Pricing Representation & Modes

All amounts are stored as **integer minor units (tiyn)** (1 KZT = 100 tiyn).

1. **Fixed Price (`fixed`):** Stored as `amount_tiyn`. Used for standard jobs (e.g. прикурка АКБ — 5 000 ₸).
2. **Diagnostic Fee (`diagnostic_fee`):** Stored as `amount_tiyn`. Covers callout and on-site fault isolation. Final repair cost is recorded at `PENDING_COMPLETION`.
3. **Estimate Range (`estimate_range`):** Stored as `min_amount_tiyn` and `max_amount_tiyn`.

---

## 5. Success Criteria & Kill Thresholds (Phase 5 Launch Gate)

| Metric | Minimum Target | Kill / Redesign Threshold |
|---|---|---|
| **Response Rate** | >= 70% requests receive >= 1 offer within 15 min | < 40% requests receive offers |
| **Time to First Offer** | Median < 5 minutes | Median > 15 minutes |
| **Offer Acceptance Rate** | >= 50% of quoted requests convert to orders | < 20% conversion to selection |
| **Order Completion Rate** | >= 80% of selected orders reach `COMPLETED` | < 50% completion (high cancellations) |
| **Provider Active Density** | >= 5 active providers online in pilot district | < 2 providers online |
