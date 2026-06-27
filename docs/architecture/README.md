# Native — Architecture Documentation

> **Last updated:** 2026-06-27
> **Status:** Living document — evolves with the product under version control.

## Purpose

This directory is the **source of truth** for Native, the manufacturing ERP for
DotAtlas. It captures *how the business actually works* and *how the product is
meant to behave* — independent of any single screen or line of code.

These documents exist so that:

- **Design happens before implementation.** Every major feature or workflow
  change is thought through and written here first. The architecture drives the
  code, not the other way around.
- **There is one shared understanding.** Sales, Dispatch, Warehouse and Accounts
  all operate on the same documented workflows, statuses and rules.
- **Decisions are durable.** When we revisit a feature months later, the
  reasoning is recorded — not lost in chat history or buried in a diff.
- **The product can be built like a real product** — where documentation,
  workflows and code evolve together, reviewed and versioned side by side.

## The Architecture-First Rule

> **Before implementing any major feature or workflow change, update the
> relevant architecture document first.**

The flow is:

1. **Write / update the architecture doc** — purpose, workflow, documents,
   statuses, rules, notifications, roadmap.
2. **Record any significant decision** in `../decisions/` (an ADR — see below).
3. **Implement** to match the documented design.
4. **Reconcile** — if implementation reveals the design was wrong, fix the doc in
   the same change. Docs and code never drift.

Small fixes (copy, spacing, a bug) don't need a doc change. A new workflow,
status, document type, permission model, or integration **does**.

## Structure

```
docs/
├── architecture/
│   ├── README.md            ← you are here
│   ├── native-principles.md ← the core philosophy of Native
│   ├── sales-orders.md      ← Sales Orders module
│   ├── dispatch.md          ← Dispatch module
│   └── warehouse.md         ← Warehouse module (forward-looking)
├── database/
│   ├── er-diagram.md        ← conceptual entity relationships
│   └── product-hierarchy.md ← how products are modelled
└── decisions/               ← Architecture Decision Records (ADRs)
```

## Module documents

Each module document follows a consistent shape so they're easy to compare and
keep current:

- **Purpose** — what the module is for.
- **Users** — which roles/departments use it.
- **Workflow** — the end-to-end flow and stage transitions.
- **Documents** — the business documents created and how they link.
- **Statuses** — the lifecycle states and how they're derived.
- **Permissions** — who can do what.
- **Business Rules** — the invariants that must always hold.
- **Notifications** — what is surfaced to whom, and when.
- **Future Roadmap** — what's coming, especially ERP/integration phases.

## How to read this with the product

Native is currently a single-page application (`public/index.html`) backed by a
static order dataset (`public/data/orders.json`) with a browser-local overlay for
all workflow state. The architecture docs describe the *intended* model; the
overlay is the present-day persistence mechanism, to be replaced by a real
backend as the modules mature (see each module's Future Roadmap).
