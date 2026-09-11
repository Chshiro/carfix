# CarFix Slice 1: Manual QA Testing Guide

This document provides a human-facing manual test procedure for validating the **CarFix Vertical Slice 1** (Request → Provider Eligibility → Offer Submission → Atomic Selection → Order Creation) and its security boundaries.

---

## 1. Preconditions & Setup

Before running the manual test scenarios, ensure the environment is initialized:

1. **PostgreSQL with PostGIS is running:**
   ```bash
   docker compose up -d
   ```
2. **Apply Migrations and Seed Data:**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
3. **Start Development Server in Demo Mode:**
   ```bash
   npm run dev
   ```
   *(Ensure `DEMO_MODE=true` is set in `.env` for local testing; in production, `DEMO_MODE=false` blocks unauthorized demo token creation).*
4. **Open Application in Browser:**
   Navigate to [http://localhost:3000](http://localhost:3000).

---

## 2. Seeded Test Identities

The database seed provides deterministic development and testing identities. No manual SQL insertions are needed.

| Role | Name / Description | User ID | Provider ID | Phone | Capabilities | Service Mode | Location (Astana) | Status |
|---|---|---|---|---|---|---|---|---|
| **Motorist** (Customer) | Demo Customer | `c0000000-0000-0000-0000-000000000001` | N/A | `+77011112233` | N/A | N/A | Astana Baiterek | Active |
| **Provider 1** | Мастер Азамат (Автоэлектрик / АКБ) | `a1000000-0000-0000-0000-000000000001` | `b1000000-0000-0000-0000-000000000001` | `+77021112233` | `AUTO_ELECTRIC`, `BATTERY` | `MOBILE` | Esil (~1.1 km) | Online / Active |
| **Provider 2** | СТО Барыс (Диагностика / Электрика) | `a2000000-0000-0000-0000-000000000002` | `b2000000-0000-0000-0000-000000000002` | `+77031112233` | `AUTO_ELECTRIC`, `DIAGNOSTICS` | `MOBILE`, `AT_LOCATION` | Saryarka (~2.3 km) | Online / Active |
| **Provider 3** | Срочная Прикурка Астана (Бауыржан) | `a3000000-0000-0000-0000-000000000003` | `b3000000-0000-0000-0000-000000000003` | `+77041112233` | `BATTERY` | `MOBILE` | Baiterek (~0.6 km) | Online / Active |
| **Provider 4** | Мобильный Механик Данияр | `a4000000-0000-0000-0000-000000000004` | `b4000000-0000-0000-0000-000000000004` | `+77051112233` | `MECHANICAL_MINOR` | `MOBILE` | (~3.1 km) | Online / Active |
| **Provider 5** | Универсал Автопомощь (Тимур) | `a5000000-0000-0000-0000-000000000005` | `b5000000-0000-0000-0000-000000000005` | `+77061112233` | `AUTO_ELECTRIC`, `MECHANICAL_MINOR` | `MOBILE` | (~1.9 km) | Online / Active |
| **Provider 6** | СТО Косшы (Вне радиуса 5км) | `a6000000-0000-0000-0000-000000000006` | `b6000000-0000-0000-0000-000000000006` | `+77071112233` | `AUTO_ELECTRIC`, `BATTERY` | `MOBILE` | Kosshy (~25 km) | Online / Out of radius |
| **Provider 7** | Автоэлектрик (Оффлайн) | `a7000000-0000-0000-0000-000000000007` | `b7000000-0000-0000-0000-000000000007` | `+77081112233` | `AUTO_ELECTRIC`, `BATTERY` | `MOBILE` | Esil (~1.0 km) | Offline |
| **Provider 8** | Заблокированный Сервис | `a8000000-0000-0000-0000-000000000008` | `b8000000-0000-0000-0000-000000000008` | `+77091112233` | `AUTO_ELECTRIC`, `BATTERY` | `MOBILE` | Esil (~1.0 km) | Blocked |

---

## 3. End-to-End Test Scenarios

### Scenario A: Customer Creates Service Request
1. Select Category: **"⚡ Не заводится / электрика"** (`electrical_starting`).
2. Location: Keep default Astana Baiterek coordinates (`51.1283, 71.4305`).
3. Click **"🚀 Найти мастера"**.
- **Expected Outcome:**
  - Request is created with status `PUBLISHED`.
  - UI displays `matchedProvidersCount: 3` (Provider 1, Provider 2, and Provider 5 match `AUTO_ELECTRIC`/`DIAGNOSTICS` within 5 km).
  - Provider directory / provider names are **NOT** leaked in the response.

### Scenario B: Eligible Provider 1 Submits Offer
1. In the **"🛠️ Тестовый интерфейс исполнителя"** block:
   - Select Provider: **"Мастер Азамат (Автоэлектрик/АКБ)"** (`b1...0001`).
   - Pricing Mode: **"Выезд + диагностика"** (`diagnostic_fee`).
   - Price: `5,000` KZT.
   - ETA: `20` minutes.
2. Click **"📩 Отправить предложение от лица мастера"**.
- **Expected Outcome:**
  - Offer is created with status `SUBMITTED`.
  - Service request status transitions from `PUBLISHED` → `OFFERS_RECEIVED`.
  - Customer offers list updates automatically to show 1 offer.

### Scenario C: Eligible Provider 2 Submits Second Offer
1. In the provider block:
   - Select Provider: **"СТО Барыс (Диагностика/Электрика)"** (`b2...0002`).
   - Pricing Mode: **"Фиксированная цена"** (`fixed`).
   - Price: `8,000` KZT.
   - ETA: `15` minutes.
2. Click **"📩 Отправить предложение"**.
- **Expected Outcome:**
  - Offer succeeds.
  - Customer now sees both offers in the list with their respective ratings, ETAs, and pricing.

### Scenario D: Ineligible Provider (Wrong Capability) Rejected
1. Select Provider: **"Мобильный Механик Данияр"** (`b4...0004`, has only `MECHANICAL_MINOR`).
2. Attempt to submit an offer for the `electrical_starting` request.
- **Expected Outcome:**
  - Submission rejected with `403 Forbidden` ("Provider does not have the required capabilities for this request").

### Scenario E: Customer Selects Provider 1 Offer
1. In the Customer Offers list, click **"Выбрать мастера"** next to **Мастер Азамат**.
- **Expected Outcome:**
  - Order is created atomically in status `PROVIDER_SELECTED`.
  - Provider 1 offer is marked `ACCEPTED`.
  - Provider 2 offer is marked `REJECTED`.
  - Request status is marked `PROVIDER_SELECTED`.
  - UI transitions to "Мастер выбран! Заказ подтвержден" showing contact action buttons.

### Scenario F: Provider Location Privacy
1. Call `GET /api/requests/:id` with Provider 1 token before selection:
   - Location is masked (`location: null`).
2. Call `GET /api/requests/:id` with Provider 1 token after selection:
   - Exact location (`51.1283, 71.4305`) is returned.

### Scenario G: Unauthorized Motorist Rejection
1. Attempt to view request or offers using Customer B token (`c2...0002`):
   - Rejected with `403 Forbidden`.

### Scenario H: Blocked Provider Rejection
1. Attempt to submit an offer using Provider 8 (`b8...0008`):
   - Rejected with `403 Forbidden` ("User account is blocked").

### Scenario I: Expired Request Rejection
1. Attempt to submit an offer or select an offer on an expired request (`expires_at < NOW()`):
   - Rejected with `409 Conflict` ("Request has expired").

### Scenario J: Duplicate Offer Rejection
1. Provider 1 attempts to submit a second offer on the same request:
   - Rejected with `409 Conflict` ("Provider has already submitted an offer for this request").

### Scenario K: Forged Identity Rejection
1. Send `POST /api/requests` with `{ customerId: "arbitrary-id" }`:
   - System ignores client-supplied `customerId` and binds to authenticated JWT user.
2. Send `POST /api/offers` with `{ providerId: "b2..." }` using Provider 1 token:
   - System ignores client-supplied `providerId` and binds to Provider 1's profile from JWT.

---

## 4. Expected Database State Progression

```text
[Service Request]
  1. Initial Creation:  status = 'PUBLISHED',   current_radius_km = 5
  2. First Offer:       status = 'OFFERS_RECEIVED'
  3. Offer Selection:   status = 'PROVIDER_SELECTED'

[Provider Offers]
  1. Offer 1 Submitted: status = 'SUBMITTED'
  2. Offer 2 Submitted: status = 'SUBMITTED'
  3. Offer 1 Selected:  Offer 1 status = 'ACCEPTED'
                        Offer 2 status = 'REJECTED'

[Orders]
  1. Created on Selection: status = 'PROVIDER_SELECTED', agreed_pricing_mode = 'diagnostic_fee', agreed_amount_tiyn = 500000

[Order Status History]
  1. Initial Entry: from_status = NULL, to_status = 'PROVIDER_SELECTED', actor_role = 'motorist'
```
