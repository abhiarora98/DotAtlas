# Backend Overview

| | |
|---|---|
| **Version** | 0.1 |
| **Status** | 📝 Draft |
| **Last Updated** | 27 Jun 2026 |
| **Related ADRs** | ADR-0001, ADR-0003 |
| **Related Modules** | All |

> The overall shape of Native's backend and how information flows through it.
> Target stack: **PostgreSQL + Prisma + NestJS**, object storage for documents, a
> Redis-backed job queue, JWT auth. No code yet — this is the map.

---

## Layered architecture

```
┌───────────────────────────────────────────────────────────────┐
│  FRONTEND                                                       │
│  Department workspaces (Sales / Dispatch / Warehouse /          │
│  Accounts). Today: single-page app. Future: same app on the    │
│  REST API. Renders workflow + the single next action.          │
└───────────────▲───────────────────────────────────────────────┘
                │  HTTPS / JSON  (REST, versioned /api/v1)
┌───────────────┴───────────────────────────────────────────────┐
│  API LAYER  (NestJS controllers)                               │
│  Routing, request validation (DTOs), authn (JWT guard),        │
│  authz (RBAC guard), response shaping, error mapping,          │
│  audit interceptor. Thin — no business rules here.             │
└───────────────▲───────────────────────────────────────────────┘
                │  calls services
┌───────────────┴───────────────────────────────────────────────┐
│  BUSINESS LOGIC LAYER  (NestJS modules/services)               │
│  One module per department (Sales, Dispatch, Warehouse,        │
│  Accounts) + shared domain services (Variance engine, Status   │
│  derivation, Product/Units, Audit, Notifications). All rules    │
│  live here, once. Emits domain events.                         │
└──────▲─────────────────────▲──────────────────────▲────────────┘
       │ Prisma              │ storage SDK          │ events
┌──────┴───────┐   ┌─────────┴────────┐   ┌─────────┴──────────┐
│ DATABASE     │   │ FILE STORAGE     │   │ BACKGROUND JOBS    │
│ PostgreSQL   │   │ S3-compatible    │   │ Redis + BullMQ     │
│ (Prisma)     │   │ (packing slips,  │   │ (notifications,    │
│ source of    │   │  invoices, PODs) │   │  ERP sync, exports)│
│ truth        │   └──────────────────┘   └────────────────────┘
└──────────────┘
                          ┌──────────────────────────┐
                          │ FUTURE AI SERVICES        │
                          │ doc parsing, anomaly/      │
                          │ variance insights, agents  │
                          │ (consume events + data)    │
                          └──────────────────────────┘
```

## Layers

### Frontend
Department workspaces that render the workflow and surface the single next
action. Today a static SPA backed by a browser-local overlay; it will move onto
the REST API unchanged in behaviour. The frontend holds **no business rules** —
it reflects state and calls the API.

### API Layer (NestJS controllers)
The thin HTTP edge: routing, DTO validation, authentication (JWT guard),
authorization (role/permission guard), response shaping and error mapping, and an
audit interceptor that records who did what. Controllers delegate immediately to
services and contain no domain logic. See [`api-strategy.md`](./api-strategy.md).

### Business Logic Layer (NestJS modules/services)
The heart of the system. **One module per department** (Sales, Dispatch,
Warehouse, Accounts) owning its writes, plus **shared domain services** used
everywhere:
- **Variance engine** — the single quantity-variance implementation shared by
  dispatch entry and packing-slip verification.
- **Status derivation** — computes order status from documents (never stored).
- **Product / Units** — hierarchy, variant/SKU, unit rules.
- **Audit** — append-only history for every state change.
- **Notifications** — turns events into user-facing alerts.

Rules live here exactly once (Principle #1) and modules talk across boundaries via
events or read-only queries, never by editing each other's documents.

### Database Layer (PostgreSQL + Prisma)
The single source of truth for written facts. Prisma provides schema-as-code,
migrations and generated types. Derived values (fulfilment, status, variance) are
**computed on read**, not stored as second copies. The logical model is
[`database-design.md`](./database-design.md); the conceptual model is
[`../database/er-diagram.md`](../database/er-diagram.md).

### File Storage (object storage)
Uploaded source documents — packing slips, sales invoices, future PODs — live in
S3-compatible object storage. The database stores **metadata + a storage key**,
never the binary. Access is via short-lived signed URLs. (Today's SPA stores a
data URL in the local overlay; that is the Phase-1 stand-in for this.)

### Authentication & Authorization
JWT-based sessions (access + refresh). Every request carries a bearer token; a
guard resolves the user and role; an RBAC guard enforces per-endpoint permissions
aligned to [`module-boundaries.md`](./module-boundaries.md). Details in
[`api-strategy.md`](./api-strategy.md).

### Background Jobs (Redis + BullMQ)
Asynchronous, retryable work decoupled from the request: sending notifications,
generating load-sheet/exports/PDFs, syncing the inventory ERP and accounting feeds
(Phase 2), and processing the event outbox. Jobs are idempotent and observable.

### Future AI Services
Downstream consumers, not in the critical path: parsing uploaded packing
slips/invoices into structured lines (replacing manual entry), surfacing
variance/anomaly insights, and agentic assistants. They subscribe to the
[event system](./event-system.md) and read the database; they never bypass the
business-logic layer's invariants.

## How information flows

**Write (command) path** — e.g. *Mark Dispatched*:
1. Frontend → `POST /api/v1/orders/:id/dispatches` with a validated DTO.
2. API layer authenticates, authorizes (Dispatch role), passes to the Dispatch
   service.
3. Service applies rules (append-only record, no order mutation), writes via
   Prisma **inside a transaction**, appends an audit entry, and records a domain
   event in the **outbox** (same transaction).
4. A background worker drains the outbox → emits `dispatch.recorded` → consumers
   (notifications, dashboards, future AI) react.
5. API returns the updated, **derived** order view.

**Read (query) path** — e.g. opening an order:
1. Frontend → `GET /api/v1/orders/:id`.
2. Service loads the immutable order + its document chain, **derives** status,
   fulfilment and variance, and returns a composed read model. No derived field is
   persisted.

## Cross-cutting concerns

- **Transactions** wrap each state change so the document write, audit entry and
  outbox event commit together (no partial state).
- **Audit trail** is automatic for every state-changing action (Principle #4).
- **Validation** at the edge (DTOs) and **invariants** in services (the rules that
  can't be expressed as simple field checks).
- **Idempotency** for external-facing commands and all jobs.
- **Observability** — structured logs, request tracing, job metrics.

## Phasing

- **Phase 1:** SPA on the local overlay (today) → first NestJS modules on Postgres,
  replacing the overlay module-by-module behind the same workflows.
- **Phase 2:** Inventory ERP and accounting integrations feed the packing-slip and
  invoice steps via background jobs — the screens/workflows are unchanged.
- **Phase 3:** AI services consume events and documents for parsing and insight.
