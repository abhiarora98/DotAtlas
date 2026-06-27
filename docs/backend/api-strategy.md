# API Strategy

| | |
|---|---|
| **Version** | 0.1 |
| **Status** | 📝 Draft |
| **Last Updated** | 27 Jun 2026 |
| **Related ADRs** | ADR-0001, ADR-0003 |
| **Related Modules** | All |

> The blueprint for Native's HTTP API — **no code**. REST resources,
> authentication, versioning, error handling and permissions. The API is a thin
> edge over the business-logic layer; rules live in services, not controllers.

---

## Style & conventions

- **REST, resource-oriented, JSON.** Nouns as resources; sub-resources express the
  document chain (an order's dispatches, a dispatch's packing slip).
- **Verbs via HTTP methods:** `GET` (read), `POST` (create / workflow action),
  `PATCH` (edit *only* where the entity is editable), `DELETE` (rare; soft-delete).
- **Workflow actions** that don't map to plain CRUD are modelled as
  **sub-resource `POST`s** (e.g. `POST /orders/:id/ready`,
  `POST /orders/:id/dispatches`) rather than overloading `PATCH`. This matches the
  state machine — actions cause transitions.
- **Derived data** (status, fulfilment, variance) is returned in read models; it is
  never accepted on writes.
- **Idempotency-Key** header supported on creating commands to make retries safe.
- **Pagination** (`?page=&pageSize=`), **filtering** and **sorting** on list
  endpoints; consistent envelope `{ data, page, pageSize, total }`.

## Versioning

- **URI versioning:** all endpoints under **`/api/v1`**. Breaking changes ship a new
  major version (`/api/v2`); additive changes stay in v1.
- Responses include an `API-Version` header. Deprecations are announced via a
  `Deprecation` header and a sunset date.

## Authentication strategy

- **JWT bearer tokens.** Short-lived **access token** (sent as
  `Authorization: Bearer …`) + longer-lived **refresh token** (httpOnly cookie or
  secure store) via `POST /auth/refresh`.
- `POST /auth/login` → tokens; `POST /auth/logout` → revoke refresh.
- Access token carries `sub` (user id), `role`, and minimal claims. The API
  resolves the full permission set server-side from the role.
- File access uses **short-lived signed URLs** issued by the API, not the bearer
  token directly.

## Authorization (permissions)

Role-based, aligned to [`module-boundaries.md`](./module-boundaries.md). A guard
checks the caller's role against the endpoint's required permission; writes are
allowed only to the **owning** module's role.

| Capability | Sales | Dispatch | Warehouse | Accounts | Management/Admin |
|---|---|---|---|---|---|
| Read orders | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create/confirm PI, Mark Ready | ✅ | — | — | — | ✅ |
| Record dispatch, verify packing slip | — | ✅ | — | — | ✅ |
| Pick/pack confirmations | — | — | ✅ | — | ✅ |
| Verify invoice, record payments | — | — | — | ✅ | ✅ |
| Acknowledge variance | ✅ | — | — | — | ✅ |
| Manage users/roles/catalogue | — | — | — | — | ✅ (Admin) |

Ownership is enforced server-side regardless of UI; a Dispatch token cannot edit a
Sales Order even by crafting the request.

## Representative endpoints (`/api/v1`)

### Auth & identity
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` · `/auth/refresh` · `/auth/logout` | Session lifecycle |
| GET | `/me` | Current user + permissions |

### Sales
| Method | Path | Purpose | Role |
|---|---|---|---|
| GET/POST | `/quotations` | List / create quotations | Sales |
| POST | `/quotations/:id/convert` | Convert to PI | Sales |
| GET/POST | `/orders` | List / create sales orders | Sales |
| GET | `/orders/:id` | Order read model (derived status/fulfilment/variance) | all |
| POST | `/orders/:id/confirm` | Draft → Confirmed | Sales |
| POST | `/orders/:id/ready` | Confirmed → Ready (handover payload) | Sales |
| POST | `/orders/:id/variance/acknowledge` | Review packing-slip variance | Sales |

### Dispatch
| Method | Path | Purpose | Role |
|---|---|---|---|
| GET/POST | `/orders/:id/dispatches` | List / record shipments (full/partial) | Dispatch |
| POST | `/orders/:id/packing-slip` | Create/verify packing slip | Dispatch |
| GET/POST | `/transporters` | List / add transporters | Dispatch |
| GET | `/orders/:id/load-sheet` | Generate load sheet (async export) | Dispatch/Warehouse |

### Accounts
| Method | Path | Purpose | Role |
|---|---|---|---|
| GET/POST | `/orders/:id/invoice` | Create/verify sales invoice | Accounts |
| GET/POST | `/payments` | List / record payments | Accounts |
| POST | `/payments/:id/allocate` | Allocate to invoice(s) | Accounts |

### Platform
| Method | Path | Purpose | Role |
|---|---|---|---|
| POST | `/attachments` | Upload a document → returns key | owning role |
| GET | `/attachments/:id/url` | Short-lived signed view URL | owning role |
| GET | `/orders/:id/timeline` | Audit/workflow history | all |
| GET | `/notifications` | Current user's alerts | all |
| GET/POST | `/products`, `/variants` | Catalogue | Admin |

## Error handling

- **Format:** RFC 9457 *problem+json* — `{ type, title, status, detail, instance,
  errors? }`.
- **Status codes:** `400` validation, `401` unauthenticated, `403` forbidden
  (wrong role / not owner), `404` not found, `409` **illegal state transition** or
  idempotency conflict, `422` business-rule violation, `500` unexpected.
- **Illegal transitions** (from the [state machine](./state-machine.md)) return
  `409` with a machine-readable `code` (e.g. `ORDER_NOT_DISPATCHABLE`) and a
  human message.
- **Validation errors** list per-field issues under `errors`.
- Errors **never leak internals**; every error carries a correlation id (also in
  logs) for support.

## Non-functional

- **Transactions** wrap each command (document write + audit + outbox event).
- **Rate limiting** and **request size limits** on upload endpoints.
- **CORS** restricted to the app origins.
- **Observability:** structured request logs with correlation ids; per-endpoint
  metrics; health/readiness probes.
