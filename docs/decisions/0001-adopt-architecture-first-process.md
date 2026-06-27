# 0001 — Adopt an architecture-first development process

- **Status:** Accepted
- **Date:** 2026-06-27

## Context

Native had been growing feature-by-feature through conversation, with the design
living only in chat history and the implementation. As the product matured
(department workflows, partial dispatch, reconciliation), this made it hard to
keep a shared, durable understanding of how the business is meant to work, and
risked the code becoming the only "spec".

## Decision

Introduce a versioned `/docs` tree as the **source of truth** for Native:

- `docs/architecture/` — module architecture documents (Sales Orders, Dispatch,
  Warehouse) plus core principles.
- `docs/database/` — conceptual ER diagram and the product hierarchy.
- `docs/decisions/` — these ADRs.

Adopt the rule: **before implementing any major feature or workflow change,
update the relevant architecture document first.** The architecture drives the
code; docs and code evolve together under version control and never drift.

## Consequences

- Every substantial change now has two parts: the doc update and the
  implementation, reviewed together.
- Onboarding and revisiting features is far easier — intent is written down.
- Slight overhead for large features; none for trivial fixes (which are exempt).
- Existing, already-built behaviour was back-filled into the initial documents so
  they start as an accurate description of the system, not an aspiration.
