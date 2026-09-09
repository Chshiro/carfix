# CARFIX — PRODUCT SPECIFICATION

**Version:** 1.0  
**Date:** 2026-09-09  
**Status:** MVP Definition

---

## Product Vision

CarFix is a real-time automotive services marketplace that connects motorists experiencing urgent vehicle problems with nearby, available, verified service providers. The product eliminates the frustration of calling multiple mechanics by letting one structured request reach all relevant providers simultaneously, who then compete with transparent offers.

**One-line vision:** The fastest way to get your car fixed in Astana.

---

## Problem Statement

When a motorist in Astana experiences an urgent vehicle problem — car won't start, battery dead, electrical failure — they face a fragmented and stressful discovery process:

1. **No real-time availability data.** 2GIS lists mechanics but can't tell you who is free right now.
2. **Price opacity.** The motorist has no idea what the service should cost until the mechanic arrives and names their price.
3. **Call fatigue.** Finding an available, nearby, suitable provider requires 3-8 phone calls.
4. **Trust deficit.** No way to verify qualifications or see track record beyond sparse 2GIS reviews.
5. **Time pressure.** The longer the motorist waits, the more stressful and potentially dangerous the situation becomes.

CarFix solves this by inverting the model: instead of the motorist searching for providers, providers are notified of the motorist's problem and compete for the job.

---

## Target Users

### Motorist Persona

**Name:** Alikhan, 34  
**Location:** Saryarka district, Astana  
**Vehicle:** 2019 Toyota Camry  
**Scenario:** His car won't start on a Monday morning in his courtyard. He's going to be late for work. He doesn't have a regular mechanic. He searches 2GIS for "автоэлектрик," calls 4 numbers — two don't answer, one is across the city, one can come in 2 hours.

**What Alikhan needs:**
- One action that reaches multiple available mechanics
- Know who can come soonest
- Compare prices before committing
- Basic confidence the person is competent
- A solution within 30 minutes

**Behavior:** Smartphone-native. Uses inDrive for rides. Comfortable with marketplace apps. Russian-speaking. Willing to pay fair market price — not willing to be overcharged due to lack of alternatives.

---

### Provider Persona

**Name:** Ruslan, 41  
**Role:** Independent mobile auto electrician  
**Location:** Almaty district, Astana  
**Equipment:** Personal car with diagnostic tools, battery charger, basic parts  
**Scenario:** Ruslan has a 2GIS listing with 50 reviews. He gets 2-4 calls/day from the listing. Between jobs, he has 2-3 hours of unused capacity. He'd take more work if it found him.

**What Ruslan needs:**
- Customers delivered to him without marketing effort
- Clear problem descriptions (so he brings the right tools)
- Fair compensation for his skills
- No upfront cost to join
- Simple app that doesn't require tech sophistication

**Behavior:** Uses smartphone primarily for WhatsApp and 2GIS. Not tech-savvy but can learn a simple interface. Will engage if the value proposition is obvious (more paying customers).

---

## Jobs To Be Done

### Motorist JTBD

| When... | I want to... | So I can... |
|---------|-------------|------------|
| My car won't start | Find an available auto electrician near me within minutes | Get my car running and get to where I need to be |
| I have a car problem I can't describe well | Select from predefined categories | Get connected to the right specialist without needing technical knowledge |
| I receive multiple offers | Compare price, ETA, and provider ratings | Choose the best option for my situation |
| The service is complete | Rate the provider | Help other motorists make good choices |

### Provider JTBD

| When... | I want to... | So I can... |
|---------|-------------|------------|
| I have free time between jobs | Receive relevant customer requests | Fill unused capacity with paying work |
| I receive a request | See the problem description, location, and distance | Decide quickly whether to respond |
| I want to respond | Submit my price and ETA | Win the job by offering competitive terms |
| I complete a job | Have it recorded in my profile | Build my reputation and get more customers |

---

## MVP Scope

### MUST HAVE

| Feature | Justification |
|---------|--------------|
| Phone number registration + SMS OTP | Minimum viable authentication for Kazakhstan market |
| User role selection (motorist/provider) | Marketplace has two sides |
| Provider profile (name, photo, specializations) | Providers must be identifiable and categorized |
| Provider availability toggle (online/offline) | Core marketplace mechanic — only active providers receive requests |
| Provider location (GPS with manual adjustment) | Required for distance-based matching |
| Vehicle registration (make, model, year) | Helps providers understand the job |
| Service request creation (category, description, location, optional photos) | Core demand-side action |
| Real-time provider matching (category + distance + availability) | Core marketplace engine |
| Provider notifications for new requests | Providers must know about requests |
| Provider offer submission (price, pricing model, ETA) | Core supply-side action |
| Motorist offer comparison view | Core marketplace value — see competing offers |
| Offer acceptance / provider selection | Transaction initiation |
| Order state machine (accepted → en_route → arrived → in_progress → completed) | Order lifecycle tracking |
| Mutual completion confirmation | Both sides agree service is done |
| Rating system (1-5 stars + text, both directions) | Trust layer |
| Request history (motorist) and job history (provider) | Platform stickiness, service records |
| Responsive mobile-first web UI | Primary access platform |

### SHOULD HAVE (Post-Validation)

| Feature | Justification |
|---------|--------------|
| SMS notifications for providers | Push notification backup — critical for reliability |
| Request expiration with auto-cancellation | Cleanup stale requests |
| Provider credential verification (manual admin review) | Trust enhancement |
| Expanded categories (tire, towing) | Market expansion |
| PWA install prompt | Better mobile experience without app store |
| Admin dashboard (basic) | Operational management |

### NOT NOW

| Feature | Why Not |
|---------|--------|
| AI problem classification | Manual category selection works; AI is Phase 8 |
| In-app payments | Cash/direct transfer for MVP; payment adds massive complexity |
| Chat | Structured offers replace free-form chat |
| Native mobile apps | PWA first; native only if PWA fails |
| Real-time provider tracking | Provider shares ETA, not live location |
| Multi-city | Astana only |
| Multi-language | Russian only |
| Provider subscription/monetization | Free during marketplace bootstrapping |

### POTENTIAL FUTURE PLATFORM

| Feature | Strategic Value |
|---------|----------------|
| Fleet management / B2B | High revenue per account |
| Insurance partnerships | High-value channel |
| Computer vision damage assessment | Differentiation in accident services |
| Provider SaaS tools (scheduling, inventory) | Platform stickiness |
| Competitive intelligence for providers (market pricing data) | Monetizable data product |

---

## User Journeys

### Journey 1: Motorist Creates Emergency Request

```
1. Motorist opens carfix.kz on mobile browser
2. If not logged in → phone number + SMS OTP
3. Landing screen shows "Нужна помощь?" (Need help?) with prominent CTA
4. Motorist taps "Создать заявку" (Create Request)
5. Step 1: Select category
   - "Не заводится / электрика" (Won't start / electrical)
   - "Аккумулятор / прикурить" (Battery / jump-start)
   - "Мобильный механик" (Mobile mechanic)
   - "Шиномонтаж" (Tire service) [if enabled]
   - "Эвакуатор" (Towing) [if enabled]
6. Step 2: Select/confirm vehicle (if registered) or quick-add
7. Step 3: Describe problem (free text, optional)
8. Step 4: Add photos (optional, max 3)
9. Step 5: Confirm location (GPS auto-detected, adjustable on map)
10. Step 6: Select service type
    - "Мастер приедет ко мне" (Provider comes to me)
    - "Я приеду в сервис" (I go to provider)
    - "Нужна эвакуация" (Need towing)
11. Tap "Опубликовать" (Publish)
12. Request is live — waiting screen with count of notified providers
```

### Journey 2: Provider Receives and Responds

```
1. Provider is online (availability toggle ON, location updated)
2. Push notification: "Новая заявка: Не заводится, 2.3 км от вас"
   (New request: Won't start, 2.3 km from you)
3. Provider taps notification → request detail screen
4. Sees: category, vehicle (make/model/year), description, photos, distance, map
5. Provider decides to respond → taps "Сделать предложение" (Make offer)
6. Fills in:
   - Price: [amount in KZT]
   - Pricing model: Фиксированная / После осмотра / Диапазон
     (Fixed / After inspection / Range)
   - ETA: [minutes]
   - Short message (optional): "Скорее всего стартер, возьму с собой"
     (Probably the starter, will bring one along)
7. Submits offer
8. Offer appears in motorist's comparison view
```

### Journey 3: Motorist Compares Offers

```
1. Motorist sees offers arriving in real-time on waiting screen
2. Each offer card shows:
   - Provider name, photo, rating (stars + completed jobs count)
   - Price and pricing model (clearly labeled)
   - ETA
   - Short message (if provided)
   - Distance
3. Motorist can tap any offer card to see full provider profile
4. Cards are sortable by: price, ETA, rating
5. Motorist selects preferred offer → taps "Выбрать мастера" (Choose provider)
6. Confirmation dialog: "Вы выбрали [Provider]. Цена: [X] KZT. ETA: [Y] мин."
7. Motorist confirms
8. Other providers are notified that the request is taken
```

### Journey 4: Provider Accepts and Travels

```
1. Selected provider receives notification: "Вас выбрали! Клиент ожидает."
   (You were selected! Customer is waiting.)
2. Order status: ACCEPTED → EN_ROUTE
3. Provider can see customer location on map
4. Customer sees: "Мастер в пути. Ожидаемое время: [ETA]"
   (Provider en route. Expected time: [ETA])
5. Provider arrives → taps "Я на месте" (I've arrived)
6. Order status: EN_ROUTE → ARRIVED
7. Customer sees: "Мастер прибыл"
   (Provider has arrived)
```

### Journey 5: Service Completion

```
1. Provider begins work → taps "Начал работу" (Started work)
2. Order status: ARRIVED → IN_PROGRESS
3. Provider completes work → taps "Работа завершена" (Work completed)
4. Final price field (if pricing model was "after inspection" or "range"):
   - Provider enters final price
5. Order status: IN_PROGRESS → PENDING_CONFIRMATION
6. Customer receives: "Мастер завершил работу. Подтвердите завершение."
   (Provider finished. Please confirm completion.)
7. Customer reviews final price (if changed from estimate)
8. Customer taps "Подтвердить" (Confirm)
9. Order status: COMPLETED
10. Payment happens off-platform (cash, Kaspi transfer, etc.)
```

### Journey 6: Rating and History

```
1. After completion, both sides see rating prompt
2. Customer rates provider: 1-5 stars + optional comment
3. Provider rates customer: 1-5 stars + optional comment
4. Ratings appear on respective profiles
5. Completed order appears in:
   - Customer's "Мои заявки" (My requests) history
   - Provider's "Мои заказы" (My orders) history
6. History shows: date, category, vehicle, price, rating given/received
```

---

## Core Order Model — State Machine

```
                    ┌──────────┐
                    │  DRAFT   │
                    └────┬─────┘
                         │ publish
                    ┌────▼─────┐
            ┌───────┤ PUBLISHED│◄─────────────┐
            │       └────┬─────┘              │
            │            │ offers arrive       │
     expire │       ┌────▼──────────┐         │
            │       │ OFFERS_RECEIVED│         │
            │       └────┬──────────┘         │
            │            │ select provider     │
            │       ┌────▼──────────────┐     │
            │       │ PROVIDER_SELECTED  │     │
            │       └────┬──────────────┘     │
            │            │ provider confirms   │
            │       ┌────▼─────┐              │
            │       │ EN_ROUTE │──cancel──────┘
            │       └────┬─────┘
            │            │ arrive
            │       ┌────▼─────┐
            │       │ ARRIVED  │──cancel──┐
            │       └────┬─────┘          │
            │            │ start work     │
            │       ┌────▼────────┐       │
            │       │ IN_PROGRESS │       │
            │       └────┬────────┘       │
            │            │ complete        │
            │       ┌────▼─────────────┐  │
            │       │PENDING_COMPLETION│  │
            │       └────┬─────────────┘  │
            │            │ confirm         │
            │       ┌────▼─────┐          │
            │       │COMPLETED │          │
            │       └──────────┘          │
            │                              │
            ▼                              ▼
       ┌─────────┐                  ┌───────────┐
       │ EXPIRED │                  │ CANCELLED │
       └─────────┘                  └───────────┘
```

### State Definitions

| State | Description | Actor | Transitions |
|-------|-------------|-------|-------------|
| `DRAFT` | Request created but not published | Motorist | → PUBLISHED, → CANCELLED |
| `PUBLISHED` | Live request, providers being notified | System | → OFFERS_RECEIVED, → EXPIRED, → CANCELLED |
| `OFFERS_RECEIVED` | At least one offer exists | System | → PROVIDER_SELECTED, → EXPIRED, → CANCELLED |
| `PROVIDER_SELECTED` | Motorist chose a provider | Motorist | → EN_ROUTE, → CANCELLED |
| `EN_ROUTE` | Provider traveling to customer | Provider | → ARRIVED, → CANCELLED |
| `ARRIVED` | Provider at customer location | Provider | → IN_PROGRESS, → CANCELLED |
| `IN_PROGRESS` | Service being performed | Provider | → PENDING_COMPLETION |
| `PENDING_COMPLETION` | Provider finished, awaiting customer confirmation | Provider | → COMPLETED, → DISPUTED |
| `COMPLETED` | Service confirmed by both sides | Motorist | Terminal |
| `EXPIRED` | No provider selected within timeout | System | Terminal |
| `CANCELLED` | Cancelled by either party | Motorist/Provider | Terminal |
| `DISPUTED` | Customer disputes completion/price | Motorist | → COMPLETED, → CANCELLED (admin) |

### Transition Rules

- Only the motorist can cancel before `EN_ROUTE`
- After `EN_ROUTE`, cancellation requires provider acknowledgment (or admin intervention)
- `EXPIRED` triggers automatically after configurable timeout (default: 30 min from publish)
- Provider can only transition to next state (no skipping)
- `COMPLETED` and `EXPIRED` are terminal — no further transitions
- `DISPUTED` requires admin resolution → routes to either `COMPLETED` or `CANCELLED`

---

## Request Model

```typescript
interface ServiceRequest {
  id: string;
  customerId: string;
  vehicleId: string;
  
  // Problem
  category: ServiceCategory;
  description: string;           // free text, optional
  mediaUrls: string[];           // max 3 images
  
  // Location
  location: {
    latitude: number;
    longitude: number;
    address: string;             // reverse-geocoded or manual
  };
  
  // Service preference
  serviceType: 'PROVIDER_COMES' | 'CUSTOMER_GOES' | 'TOWING';
  
  // State
  status: RequestStatus;
  
  // Timestamps
  createdAt: Date;
  publishedAt: Date | null;
  expiresAt: Date | null;
  completedAt: Date | null;
  
  // Result
  selectedOfferId: string | null;
}

enum ServiceCategory {
  ELECTRICAL_STARTING = 'electrical_starting',   // Won't start / electrical
  BATTERY_JUMPSTART = 'battery_jumpstart',       // Battery / jump-start
  MOBILE_MECHANIC = 'mobile_mechanic',           // General mobile mechanic
  TIRE_SERVICE = 'tire_service',                 // Flat tire (Phase 2)
  TOWING = 'towing',                             // Towing (Phase 2)
}
```

---

## Provider Response (Offer) Model

```typescript
interface ProviderOffer {
  id: string;
  requestId: string;
  providerId: string;
  
  // Offer details
  price: number;                  // in tiyn (1/100 KZT)
  pricingModel: PricingModel;
  priceMax: number | null;        // for PRICE_RANGE only
  eta: number;                    // minutes
  message: string;                // short note, optional
  
  // Provider snapshot at time of offer
  distanceKm: number;            // calculated at offer time
  providerRating: number;        // snapshot
  providerCompletedJobs: number; // snapshot
  
  // State
  status: OfferStatus;
  createdAt: Date;
  
  // Final price (if different from estimate)
  finalPrice: number | null;      // set at completion
}

enum PricingModel {
  FIXED_PRICE = 'fixed_price',           // "Exactly X KZT"
  AFTER_INSPECTION = 'after_inspection', // "Need to look first, ~X KZT"
  PRICE_RANGE = 'price_range',           // "Between X and Y KZT"
}

enum OfferStatus {
  PENDING = 'pending',       // Submitted, awaiting customer decision
  ACCEPTED = 'accepted',    // Customer selected this offer
  REJECTED = 'rejected',    // Customer selected different offer
  WITHDRAWN = 'withdrawn',  // Provider withdrew offer
  EXPIRED = 'expired',      // Request expired/cancelled before selection
}
```

### UX Pricing Model Distinctions

The motorist must clearly understand what each pricing model means:

| Model | Display | Meaning |
|-------|---------|---------|
| `FIXED_PRICE` | "15,000 ₸" | This is the final price |
| `AFTER_INSPECTION` | "~15,000 ₸ (после осмотра)" | Estimate; final price after inspection |
| `PRICE_RANGE` | "12,000 – 18,000 ₸" | Final price will be within this range |

---

## Non-Functional Product Requirements

### Responsiveness
- Mobile-first design — primary usage on 360-414px screens
- Usable on tablets and desktop but optimized for phone browsers
- Touch-friendly elements (min 44px tap targets)

### Performance
- First contentful paint < 2 seconds on 4G
- Time to interactive < 4 seconds on 4G
- Request creation flow completable in < 60 seconds
- Offer appears on motorist screen within 2 seconds of provider submission

### Low-Bandwidth Considerations
- Request creation must work on 3G
- Images compressed client-side before upload (max 500KB each)
- Images are optional — request must function without photos
- Critical actions (publish, accept, confirm) must work with degraded connectivity

### Notification Latency
- Provider notification must arrive within 5 seconds of request publication
- SMS fallback within 30 seconds if push notification fails

### Image Upload
- Max 3 images per request
- Max 5MB per image (compressed to ~500KB client-side)
- Accepted formats: JPEG, PNG, WebP
- Images stored in S3-compatible storage

### Location Precision
- GPS accuracy within 50m is acceptable
- User must be able to manually adjust pin on map
- Address reverse-geocoded for display but GPS coordinates used for matching

### Privacy
- Provider's exact location not shared with motorist before selection
- Only distance shown pre-selection
- Customer location shared with selected provider only
- Phone numbers exchanged only after offer acceptance
- Comply with Kazakhstan's Law on Personal Data and Their Protection

---

## Metrics

### North Star Metric

**Completed Transactions per Week**

This single metric captures both sides of the marketplace working: demand exists, supply responds, matching works, service is delivered.

### Marketplace Metrics

| Metric | Definition | Target (Month 3) |
|--------|-----------|-------------------|
| Request Fulfillment Rate | % of published requests receiving ≥1 offer within 10 min | >60% |
| Time to First Offer | Median time from publish to first provider offer | <5 min |
| Time to Provider Selection | Median time from publish to motorist accepting an offer | <15 min |
| Completion Rate | % of accepted offers resulting in COMPLETED status | >70% |
| Cancellation Rate | % of requests cancelled after provider selected | <15% |

### Supply Metrics

| Metric | Definition | Target (Month 3) |
|--------|-----------|-------------------|
| Verified Providers | Total providers who passed verification | >60 |
| Daily Active Providers | Providers who were ONLINE at least 2 hours in a day | >25 |
| Provider Response Rate | % of notified providers who submit an offer | >20% |
| Provider Utilization | Avg completed jobs per active provider per week | >3 |

### Demand Metrics

| Metric | Definition | Target (Month 3) |
|--------|-----------|-------------------|
| Weekly Requests | Total published requests per week | >50 |
| Repeat Rate | % of customers who create a second request within 6 months | >15% |
| Requests per Customer | Avg requests per registered customer (lifetime) | >1.2 |

### Unit Economics Metrics (Post-MVP)

| Metric | Definition | Notes |
|--------|-----------|-------|
| GMV | Gross merchandise value (total transaction value) | Track from Day 1 via recorded offer prices |
| Take Rate | Platform revenue / GMV | 0% in MVP phase |
| CAC | Customer acquisition cost | Track per channel |
| Contribution Margin | Revenue - variable costs per transaction | Meaningful only after monetization |

---

## Marketplace Success Criteria for Astana

Before expanding beyond Astana, the following thresholds must be met:

| Criterion | Threshold | Rationale |
|-----------|-----------|-----------|
| Request Fulfillment Rate | >60% sustained over 4 weeks | Customers must reliably receive responses |
| Median Time to First Offer | <5 minutes | Urgency use case demands speed |
| Completion Rate | >65% | Selected providers must actually complete the work |
| Weekly Active Providers | >30 | Sufficient geographic coverage |
| Weekly Requests | >40 | Sufficient demand to sustain provider engagement |
| Customer NPS | >30 | Customers perceive genuine value |

**Expansion is NOT justified by:**
- Total registered users
- App downloads
- Press coverage
- Provider registrations (vs. active providers)

---

## Localization

### MVP Language
- **Russian** — primary language in Astana for digital services
- All UI, notifications, and system messages in Russian

### Architecture for Future Localization
- All user-facing strings externalized (not hardcoded)
- Simple key-value translation files (JSON)
- No complex i18n framework required for MVP
- Future: Kazakh, English

### Currency
- **KZT only**
- Display format: `15 000 ₸`
- Storage: integer values in tiyn (1 KZT = 100 tiyn)
- Never use floating-point for monetary calculations

---

## Assumptions to Validate

Each assumption below must be converted into a measurable experiment during the first 3 months:

| # | Assumption | Experiment | Kill Signal |
|---|-----------|-----------|-------------|
| 1 | Motorists will create requests instead of calling | Track request creation rate vs. marketing spend | <5 requests/week after 1 month of marketing |
| 2 | Providers will stay online | Track avg online hours per provider per day | <2 hours/day average |
| 3 | Providers will respond quickly | Track time to first offer | >15 min median after 2 months |
| 4 | Customers will trust unknown providers | Track offer acceptance rate | <20% of offers accepted |
| 5 | Customers will accept price ranges | Track conversion by pricing model | AFTER_INSPECTION offers consistently rejected |
| 6 | One request reaching many providers creates value | Track offers per request | <1.5 avg offers per fulfilled request |
| 7 | Providers will respond on a free platform | Track provider churn rate | >50% of providers inactive after 1 month |
