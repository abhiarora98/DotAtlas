# Native — Architecture Dashboard

| | |
|---|---|
| **Version** | 1.1 |
| **Status** | ✅ Living document |
| **Last Updated** | 27 Jun 2026 |
| **Related ADRs** | ADR-0001, ADR-0002 |
| **Related Modules** | All |

> This is the **entry point for understanding Native** — the manufacturing ERP
> for DotAtlas. It tracks every module's status at a glance and links to the
> documents that are the source of truth for how the product works.

---

## Module status

| Module | Status | Version | Completion | Depends on | Next milestone |
|---|---|---|---|---|---|
| [Sales Orders](./sales-orders.md) | ✅ Implemented | 1.1 | ~85% | Parties, Products | In-app PI creation + credit gating |
| [Dispatch](./dispatch.md) | ✅ Implemented | 1.1 | ~80% | Sales Orders, Warehouse | ERP-fed packing slip (Phase 2) |
| [Warehouse](./warehouse.md) | 🟡 In Progress | 0.2 | ~25% | Dispatch, Inventory | Dedicated pick/pack workspace (Warehouse Mode) |
| Inventory | ⚪ Planned | 0.0 | 0% | Products, Warehouse | Stock-on-hand as source of truth |
| Accounts | 🟡 In Progress | 0.3 | ~30% | Sales Orders, Dispatch | Receivables ↔ invoice linkage, payments |
| CRM | ⚪ Planned | 0.1 | ~15% | Parties, Sales Orders | Promote Customer Intelligence into a module |

**Legend:** ✅ Implemented · 🟡 In Progress · ⚪ Planned

> *Notes:* Accounts already owns the Sales Invoice reconciliation step and has a
> receivables dataset; the rest (payments, statements) is pending. CRM exists in
> embryo as the Customer Intelligence panel inside Sales Orders.

## How the modules fit together

```
                 ┌─────────────┐
                 │   Parties   │◄──────────────┐
                 └──────┬──────┘               │
                        │ places               │ billed / receivables
                 ┌──────▼──────┐        ┌───────┴──────┐
   Products ────►│ Sales Orders│───────►│   Accounts   │
                 └──────┬──────┘ owns   └──────────────┘
        ownership transfers ▼ (Ready for Dispatch)        ▲
                 ┌─────────────┐                          │ invoice verified
                 │  Dispatch   │──────────────────────────┘
                 └──────┬──────┘
            pick / pack ▼                ┌─────────────┐
                 ┌─────────────┐  stock  │  Inventory  │
                 │  Warehouse  │◄───────►│  (planned)  │
                 └─────────────┘         └─────────────┘
```

## Documents

### Architecture (`docs/architecture/`)
- **[native-principles.md](./native-principles.md)** — product philosophy (how Native should feel/behave).
- **[business-logic-principles.md](./business-logic-principles.md)** — engineering invariants every module's code must obey.
- **[sales-orders.md](./sales-orders.md)** · **[dispatch.md](./dispatch.md)** · **[warehouse.md](./warehouse.md)** — module architecture documents.

### Database (`docs/database/`)
- **[er-diagram.md](../database/er-diagram.md)** — conceptual + logical data model (entities, relationships, lifecycles).
- **[product-hierarchy.md](../database/product-hierarchy.md)** — how products, variants and SKUs are modelled.

### Backend (`docs/backend/`) — *technical architecture*
How the software implements the business (target stack: PostgreSQL + Prisma +
NestJS). See **[backend/README.md](../backend/README.md)** for: backend overview,
database design, module boundaries, document lifecycle, state machines, API
strategy and the event system.

### Decisions (`docs/decisions/`)
- Architecture Decision Records (ADRs) — the *why* behind significant choices.

## Conventions

Every architecture document carries a metadata header:

```
| Version | 1.1 |
| Status  | ✅ Implemented |   (Draft / 🟡 In Progress / ✅ Implemented)
| Last Updated | 27 Jun 2026 |
| Related ADRs | ADR-0001, ADR-0002 |
| Related Modules | Sales Orders · Warehouse · Accounts |
```

**Versioning:** bump the **minor** version for additive changes, **major** for a
workflow/contract change. Update *Last Updated* and the dashboard row on every
change.

## The Architecture-First Rule

> **Before implementing any major feature or workflow change, update the relevant
> architecture document first.** The architecture drives the code, not the other
> way around.

The flow:

1. **Write / update the architecture doc** (+ bump version, update this dashboard).
2. **Record any significant decision** as an ADR in [`../decisions/`](../decisions/).
3. **Implement** to match the documented design.
4. **Reconcile** — if implementation reveals the design was wrong, fix the doc in
   the same change. Docs and code never drift.

Trivial fixes (copy, spacing, a bug) are exempt. A new workflow, status, document
type, permission model, or integration is **not**.

## Module document shape

Module docs follow a consistent structure: **Purpose · Users · Workflow ·
Documents · Statuses · Permissions · Business Rules · Notifications · Future
Roadmap.**
