# CarFix

**Real-time automotive services marketplace for Astana, Kazakhstan.**

CarFix connects motorists who have urgent vehicle problems with nearby, available, verified service providers. One request reaches multiple providers who compete with transparent offers — price, ETA, and ratings.

> "inDrive for car problems" — the fastest way to get your car fixed in Astana.

---

## Status

**Phase 0 — Business & Product Validation** ✅ Complete

- [x] Business audit ([AUDIT.md](./AUDIT.md))
- [x] Product specification ([PRODUCT.md](./PRODUCT.md))
- [x] Technical architecture ([ARCHITECTURE.md](./ARCHITECTURE.md))
- [x] Development plan ([DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md))
- [x] Architectural decisions ([DECISIONS.md](./DECISIONS.md))
- [ ] Phase 1 — Technical Foundation (Next)

---

## What This Is

A mobile-first web application (PWA) where:

1. **Motorist** creates a structured request (category, vehicle, location, photos)
2. **Nearby available providers** get notified in real-time
3. **Providers respond** with price, ETA, and a short message
4. **Motorist compares** offers and selects a provider
5. **Service is completed** and both parties rate each other

### MVP Focus
- **City:** Astana, Kazakhstan
- **Categories:** Electrical/starting problems, battery/jump-start, mobile mechanic
- **Supply:** Mobile auto electricians, mobile mechanics
- **Language:** Russian

---

## Architecture Summary

```
Next.js 14 (React + TypeScript)
        │
   API Routes (REST)
        │
   PostgreSQL 16 + PostGIS
        │
   SSE (real-time updates)
```

- **Modular monolith** — single deployable with clean domain boundaries
- **Full-stack TypeScript** — shared types between client and server
- **PostGIS** for geospatial matching (find providers within radius)
- **SSE** for real-time updates (new offers, status changes)
- **PWA** for mobile experience without app store friction

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full details.

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for PostgreSQL)
- npm

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd carfix

# Install dependencies
npm install

# Start PostgreSQL (Docker)
docker-compose up -d

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```
DATABASE_URL=postgresql://carfix:carfix@localhost:5432/carfix
JWT_SECRET=your-secret-key
SMS_PROVIDER_API_KEY=mock  # Use 'mock' for development
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=carfix-uploads
```

---

## Project Structure

```
carfix/
├── src/
│   ├── app/          # Next.js pages and API routes
│   ├── domain/       # Business logic (framework-agnostic)
│   ├── db/           # Database schema and migrations (Drizzle)
│   ├── lib/          # Shared utilities (SMS, storage, maps)
│   ├── components/   # React components
│   └── types/        # Shared TypeScript types
├── public/           # Static assets, PWA manifest
├── docker-compose.yml
└── README.md
```

---

## Key Documents

| Document | Purpose |
|----------|---------|
| [AUDIT.md](./AUDIT.md) | Full business, marketplace, and technical audit |
| [PRODUCT.md](./PRODUCT.md) | Product specification, user journeys, state machine, metrics |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture, data model, geolocation, real-time, security |
| [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) | 8-phase development plan with tests and exit criteria |
| [DECISIONS.md](./DECISIONS.md) | Architectural Decision Records (ADRs) |

---

## Development Plan

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Business & Product Validation | ✅ Complete |
| 1 | Technical Foundation (auth, DB, project setup) | ⬜ Not Started |
| 2 | Provider Onboarding (profile, availability, location) | ⬜ Not Started |
| 3 | Customer Request Creation (vehicles, requests, images) | ⬜ Not Started |
| 4 | Marketplace Matching & Notifications | ⬜ Not Started |
| 5 | Provider Offers (pricing, comparison, selection) | ⬜ Not Started |
| 6 | Order Lifecycle (state machine, completion) | ⬜ Not Started |
| 7 | Trust Layer (ratings, history, verification) | ⬜ Not Started |
| 8 | AI-Assisted Request Structuring (post-validation) | ⬜ Not Started |

---

## License

Proprietary. All rights reserved.
