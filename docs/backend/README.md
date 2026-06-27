# Native — Backend Architecture

| | |
|---|---|
| **Version** | 0.1 |
| **Status** | 📝 Draft |
| **Last Updated** | 27 Jun 2026 |
| **Related ADRs** | ADR-0001, ADR-0003 |
| **Related Modules** | All |

> This section converts Native's **business architecture** (`../architecture/`)
> into a **technical architecture** — how the software will implement the
> business. **No backend code yet.** These are the blueprints we'll build from,
> one module at a time, on **PostgreSQL + Prisma + NestJS** (see
> [ADR-0003](../decisions/0003-backend-stack-postgres-prisma-nestjs.md)).

---

## Documents

| Doc | Purpose |
|---|---|
| [backend-overview.md](./backend-overview.md) | The layers (frontend → API → business logic → database → storage → jobs → AI) and how information flows. |
| [database-design.md](./database-design.md) | Logical entities, relationships, primary & foreign keys, ownership — and *why* each entity exists. No SQL. |
| [module-boundaries.md](./module-boundaries.md) | What each module **owns** (writes) vs. **reads** — the seams that keep logic in one place. |
| [document-lifecycle.md](./document-lifecycle.md) | The document chain (Quotation → PI → Sales Order → Dispatch → Packing Slip → Invoice → Payment): creator, owner, editability, next. |
| [state-machine.md](./state-machine.md) | Lifecycle and **every valid transition** for each major object, and which department performs it. |
| [api-strategy.md](./api-strategy.md) | REST resources, authentication, versioning, error handling, permissions. |
| [event-system.md](./event-system.md) | System events (trigger / source / consumers) that drive notifications, dashboards and future AI agents. |

## Reading order

1. **backend-overview** — the shape of the system.
2. **database-design** + **document-lifecycle** + **state-machine** — the data and
   its rules.
3. **module-boundaries** + **api-strategy** + **event-system** — how the modules
   expose and communicate that data.

## Relationship to the business docs

- The **business architecture** (`../architecture/`) says *what the business
  does*. These documents say *how the software does it*.
- The **business-logic principles** (`../architecture/business-logic-principles.md`)
  are the invariants this backend must enforce in code — single source of truth,
  immutable documents, one variance engine, ownership transfer, audit trail.
- The **conceptual data model** (`../database/er-diagram.md`) is the logical
  contract that the Prisma schema will satisfy.

## Status

All backend documents are **Draft** until reviewed together. We will not begin
implementation until the technical architecture is judged as solid as the
business architecture.
