# CARFIX — TECHNICAL AUDIT

**Date:** 2026-09-09  
**Status:** Pre-Implementation (architecture review only — no code to audit)

---

## Preamble

There is no running code in this repository. This technical audit evaluates the PROPOSED architecture against the product requirements, identifies risks, and flags issues that should be addressed before or during implementation.

---

## 1. Architecture

### Modularity: 7/10

**Good:**
- `src/domain/` is explicitly framework-agnostic — business logic separated from Next.js
- `src/app/api/` routes are thin controllers — correct separation of concerns
- `src/db/schema/` as source of truth — correct Drizzle pattern
- Clear module map with explicit dependency graph

**Issues:**
- Module boundaries are defined but not enforced. TypeScript has no built-in module isolation. Consider ESLint import rules or `eslint-plugin-boundaries` to prevent accidental coupling.
- `src/lib/` is a grab-bag ("shared utilities") — classic code smell. Should be split by actual responsibility.

### Coupling: 6/10

**Risk areas:**
- `matching` module depends on `requests`, `providers`, `provider-availability`, AND `location` — too many dependencies for a critical module. Consider making matching a pure function: `matchProviders(request, providers[]) → matchedProviders[]` — inject the data, don't fetch it internally.
- `orders` depends on `requests`, `offers`, `notifications` — correct for the domain, but notification dispatch should be event-based, not a direct dependency.

### Boundaries: 7/10

**Good:**
- API → Domain → DB layering is clear
- Types are shared via `src/types/`

**Issue:**
- No validation boundary specification. Where exactly does Zod validation happen? In the API route? In the domain function? Both? Define this once: **API routes validate input shape. Domain functions validate business rules.**

### Scalability: 7/10

Appropriate for MVP. Single VPS → separate DB → load balancer progression is well-planned. The architecture does not introduce premature distributed systems.

### Unnecessary Complexity: 2/10 (good — low complexity)

The architecture is admirably boring. No event sourcing, no CQRS, no microservices, no message queues, no GraphQL. This is correct.

---

## 2. Database

### Schema: 7/10

**Good:**
- 10 core entities cover the domain well
- Foreign keys and relationships are explicit
- UNIQUE constraints specified where needed (offer per provider per request, rating per user per order)
- Monetary values stored as integers (tiyn) — correct

**Issues:**

| Issue | Severity | Fix |
|-------|----------|-----|
| Dual location storage (lat/lng + geography column) | Medium | Use PostGIS geography as single source |
| `User.role` is single-value ENUM — can't be both motorist and provider | High | Add `user_role` junction table OR use role array |
| `vehicleId` is required FK on `ServiceRequest` | High | Make nullable — reduce request creation friction |
| No `OrderStatusHistory` table | Medium | Add for dispute audit trail |
| No `Dispute` entity | Medium | Add simple dispute tracking |
| `ProviderProfile.rating` as `DECIMAL(2,1)` allows max 9.9 — should be `DECIMAL(3,2)` for 10.00 or `DECIMAL(2,1)` is fine for 1-5 range | Low | Verify range matches 1-5 scale |
| No `AdminAction` audit log | Low-Medium | Add simple admin audit table |
| `ProviderAvailability.serviceRadiusKm` as SMALLINT — overkill for a distance. SMALLINT is fine but consider if INT is cleaner | Trivial | Keep |

### Indexes: 5/10

**Specified:**
- PostGIS GIST index on provider location ✓

**Missing (must add):**
- Index on `service_request(status, category)` — matching queries
- Index on `service_request(customer_id, created_at DESC)` — customer history
- Index on `provider_offer(request_id, status)` — offer listing per request
- Index on `provider_offer(provider_id, created_at DESC)` — provider history
- Index on `order(customer_id)` and `order(provider_id)` — order lookups
- Index on `rating(to_user_id)` — rating aggregation
- Index on `provider_availability(is_online, location_updated_at)` — matching filter
- Index on `notification(user_id, read_at)` — unread notifications

### Foreign Keys: 8/10

Well-defined. All relationships have explicit FK references.

### Constraints: 6/10

**Present:**
- UNIQUE on provider per request for offers
- UNIQUE on user per order for ratings

**Missing:**
- CHECK constraint: `price > 0`
- CHECK constraint: `eta_minutes > 0 AND eta_minutes <= 480`
- CHECK constraint: `score >= 1 AND score <= 5`
- CHECK constraint: `year >= 1900 AND year <= 2030`
- ENUM enforcement at DB level (Drizzle handles this)

### Transactions: 7/10

Offer acceptance transaction is well-designed with `SELECT FOR UPDATE`. Other operations that need transaction protection:
- Provider going offline while order is in progress (what happens to the order?)
- Request expiration while offers are pending
- Rating creation (verify order is COMPLETED, verify user hasn't already rated)

### Race Conditions: 6/10

**Addressed:**
- Double acceptance → `SELECT FOR UPDATE` ✓
- Concurrent offer modification → offers are immutable ✓

**Not addressed:**
- Provider accepts two simultaneous requests → both create orders → provider is overloaded. Current design says "this is fine, provider manages workload." Acceptable for MVP but should be tracked.
- Rating race condition: two tabs open, user submits rating twice → UNIQUE constraint handles this ✓

---

## 3. API

### Validation: 7/10 (planned)

Zod schemas planned. This is the right choice. Ensure:
- Phone number: E.164 format, Kazakhstan prefix (+7)
- Coordinates: lat (-90 to 90), lng (-180 to 180), specifically within Kazakhstan bounds
- Enum values: validate against defined enums, not arbitrary strings
- File uploads: MIME type + extension + size
- Text length limits on all free-text fields

### Authentication: 7/10 (planned)

JWT access (15 min) + refresh (30 days) is standard. Concerns:
- Refresh token rotation: is old refresh token invalidated when new one is issued? Should be.
- Logout: must invalidate refresh token server-side (requires a token blacklist or DB entry)
- Access token storage: "stored in memory" — good, but means it's lost on page refresh. Ensure refresh flow is seamless.

### Authorization: 6/10 (planned)

Role-based is defined. Missing:
- **Resource-level authorization:** A provider should not be able to view another provider's offers. A customer should not see requests from other customers. This is "row-level security" but it must be enforced in application queries, not just middleware.
- **IDOR prevention:** Every endpoint that takes a resource ID must verify the requesting user owns that resource.

### Idempotency: 4/10

Not addressed. Critical operations that need idempotency:
- Request publishing (user taps "Publish" twice due to slow connection)
- Offer submission (double-tap)
- Offer acceptance (double-tap)
- Order status transitions (provider taps "Arrived" twice)

**Fix:** Use idempotency keys or database constraints:
- Request publish: check `status != 'published'` before publishing
- Offer: UNIQUE constraint on `(request_id, provider_id)` handles this
- Acceptance: check `status` in transaction handles this
- Status transitions: compare current status before updating

### Error Handling: 3/10

Not specified. Must define:
- Consistent error response format: `{ error: string, code: string, details?: object }`
- HTTP status codes for each error type
- Never expose stack traces in production
- Never expose internal IDs or SQL errors

### Rate Limiting: 7/10 (planned)

Reasonable limits defined. In-memory implementation is fine for single-server MVP.

---

## 4. Realtime

### SSE: 6/10

**Advantages for MVP:**
- Simpler than WebSocket
- Built-in reconnection
- Works through proxies

**Risks:**
- Next.js API routes + SSE: this combination has known issues. Serverless deployments (Vercel) don't support long-lived connections. Since the plan is VPS + Docker, this is acceptable, but limits future deployment options.
- Connection limits: browsers limit SSE connections to ~6 per domain. If user has multiple tabs, connections fill up. Not likely a problem at MVP scale.
- No client → server channel: provider location updates use HTTP POST — correct, but adds latency for real-time location.

**Alternative consideration:**
- Socket.IO would provide bidirectional communication, rooms (per-request event channels), and automatic fallback. It's slightly more complex but more future-proof.
- **Recommendation:** Keep SSE for MVP. Add ADR documenting the decision point for switching to WebSocket.

### Reconnection: 6/10

EventSource auto-reconnects. But:
- What happens to events missed during disconnection? SSE supports `Last-Event-ID` header. The server must implement event replay from the missed ID. This is not trivial.
- **MVP approach:** On reconnect, client re-fetches current state via REST API. This is simpler than event replay and works fine for the first iteration.

### Duplicate Events: 3/10

Not addressed. If SSE reconnects and replays events, or if matching runs twice due to a bug, the client may see duplicate offers or duplicate state changes.

**Fix:** Every SSE event should include a unique `eventId`. Client deduplicates by ID.

### Ordering: 3/10

Not addressed. If two offers arrive nearly simultaneously, they should appear in the order received, not in whatever order the browser processes them.

**Fix:** Include a `sequence` number or timestamp in SSE events. Client sorts by sequence.

### Offline State: 2/10

Not addressed. What does the customer see if they:
- Close the browser during offer collection?
- Lose internet for 5 minutes?
- Switch to another app on their phone?

**MVP approach:** On return/reconnect, fetch current request state via REST API. If new offers arrived while offline, they appear when the data loads. This is acceptable for MVP.

---

## 5. Security

### IDOR (Insecure Direct Object Reference): 3/10

Not addressed explicitly. Every endpoint that accepts a resource ID must verify ownership. Examples:
- `GET /api/requests/:id` — verify request belongs to user, or user is the selected provider, or user is admin
- `POST /api/offers` — verify provider has access to this request (was notified)
- `PATCH /api/orders/:id/status` — verify user is the provider or customer for this order

### Privilege Escalation: 5/10

Role middleware is planned. But:
- Can a motorist change their role to provider via API?
- Can a provider modify their verification status?
- Can a non-admin access admin endpoints?

All three must be explicitly blocked.

### Exposed Secrets: 7/10

`.env.example` is planned. But:
- Must add `.env` to `.gitignore` immediately
- JWT secret must be a strong random value (not "your-secret-key" from README.md)
- S3 credentials must not be committed
- SMS provider API keys must not be committed

### Unsafe Uploads: 5/10

File upload is planned with MIME validation and size limits. Additional requirements:
- Validate file magic bytes, not just extension or Content-Type header
- Store with randomized filenames (not original user filenames — prevents path traversal)
- Serve via signed URLs with expiration
- Strip EXIF data (may contain GPS coordinates, which is a privacy concern)
- Consider virus scanning for uploaded files (optional for MVP)

### Injection: 6/10

Drizzle ORM parameterizes queries by default, preventing SQL injection. But:
- Raw SQL used for PostGIS queries must use parameterized queries, not string concatenation
- XSS: React escapes by default, but be careful with `dangerouslySetInnerHTML` (don't use it)
- Text inputs from provider messages and request descriptions must be sanitized on display

### Auth Bypass: 6/10

JWT-based auth is standard. Ensure:
- Expired tokens are rejected
- Tampered tokens are rejected (signature verification)
- Refresh tokens can be revoked (server-side token store)
- Rate limiting on auth endpoints to prevent brute force

---

## 6. Code Quality

N/A — no code exists. Recommendations for implementation:

- TypeScript strict mode: `"strict": true` in tsconfig
- ESLint with recommended rules
- Prettier for formatting
- No `any` types
- Discriminated unions for status enums
- Exhaustive switch statements for state machine transitions
- Immutable function signatures (`Readonly<T>` for input types)

---

## 7. Performance (Anticipated)

### N+1 Queries: Risk Medium

When loading request details with offers and provider profiles, there's a risk of:
1. Load request
2. For each offer: load provider → N queries

**Fix:** Use Drizzle's relational queries or explicit JOINs.

### PostGIS Query Performance: Risk Low

With <500 providers and a GIST index, `ST_DWithin` queries will be sub-millisecond. No performance concern at MVP scale.

### Image Upload: Risk Medium

Client-side compression to 500KB is good. But:
- Upload on 3G may still take 5-10 seconds per image
- Must be non-blocking — allow request creation without waiting for upload to complete
- Consider: upload images AFTER request is published, as an async enrichment

### SSE Connection Cost: Risk Low

Each SSE connection is a keep-alive HTTP connection. At <100 concurrent connections, this is negligible on a 2 vCPU VPS.

---

## Summary

The proposed architecture is **sound for an MVP** built by a solo developer. No over-engineering. No unnecessary complexity. The main risks are operational (provider adoption, marketplace liquidity) rather than technical.

### Top 5 Technical Actions Before Coding

1. Fix the `User.role` model to support dual roles
2. Make `vehicleId` optional on `ServiceRequest`
3. Add database indexes plan (listed above)
4. Define error response format
5. Add IDOR prevention pattern to every endpoint
