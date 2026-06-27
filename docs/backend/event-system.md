# Event System

| | |
|---|---|
| **Version** | 0.1 |
| **Status** | 📝 Draft |
| **Last Updated** | 27 Jun 2026 |
| **Related ADRs** | ADR-0001, ADR-0003 |
| **Related Modules** | All |

> Native emits a **domain event** for every significant state change. Events
> decouple the modules and will drive notifications, dashboards and future AI
> agents. For each event: **trigger**, **source**, and **consumers**. No code —
> this is the catalogue and the delivery contract.

---

## Why events

- **Decoupling.** A module announces *what happened*; consumers react. The Sales
  module need not know who cares that a packing slip was verified.
- **Single source of truth, many reactions.** One state change → one event → many
  independent reactions (notify, update a dashboard, trigger a job, feed AI).
- **Auditability.** Events are recorded, giving a replayable history of the system.

## Delivery contract (transactional outbox)

1. A command writes its document **and** an `OutboxEvent` row **in the same
   database transaction** (so an event is never lost or emitted for a rolled-back
   change).
2. A background worker drains the outbox and publishes to the in-process event bus
   now (Redis/BullMQ topics later for cross-service fan-out).
3. **At-least-once delivery; idempotent consumers.** Each event has a unique id;
   consumers dedupe. Order is per-subject (per order), not global.

## Event envelope

```
{
  id,                // unique event id (for dedupe)
  type,              // e.g. "packing_slip.verified"
  version,           // schema version of this event type
  occurredAt,        // timestamp
  actor: { userId, role },
  subject: { type, id },   // e.g. SalesOrder / Dispatch
  payload: { ... },        // event-specific, minimal & stable
  correlationId      // ties to the originating request
}
```

Events are **named `domain.pastTense`** and are **immutable facts** — they never
carry derived state that consumers should recompute themselves.

## Event catalogue

| Event | Trigger | Source | Consumers |
|---|---|---|---|
| `quotation.created` | Quotation drafted | Sales | CRM, Audit |
| `quotation.converted` | Quotation → PI | Sales | Sales (order create), Audit |
| `order.created` | PI confirmed | Sales | Dashboards, CRM, Audit |
| `order.ready_for_dispatch` | Sales completes handover | Sales | **Dispatch** (queue), Warehouse (pick task), Notifications, Audit |
| `dispatch.recorded` | Shipment recorded (full/partial) | Dispatch | Inventory (depletion, future), Dashboards, Notifications, Audit |
| `order.fully_dispatched` | Last units shipped | Dispatch (derived) | Dispatch (enable packing slip), Dashboards, Audit |
| `packing_slip.verified` | Quantities confirmed | Dispatch | **Accounts** (unlock invoice), Sales (if variance), Dashboards, Audit |
| `packing_slip.variance_detected` | Verified mix ≠ order | Dispatch | **Sales** (review banner), Notifications, AI insights, Audit |
| `invoice.verified` | PI ↔ invoice reconciled | Accounts | Receivables, Dashboards, Audit |
| `invoice.variance_detected` | Amount/line mismatch | Accounts | Accounts/Sales review, AI insights, Audit |
| `payment.received` | Receipt recorded | Accounts | Receivables, CRM, Dashboards, Audit |
| `payment.allocated` | Applied to invoice(s) | Accounts | Receivables, Audit |
| `order.delivered` | Delivery confirmed | Dispatch | Accounts, CRM, Audit |
| `order.closed` | Reconciled & settled | Accounts | Dashboards, CRM, Audit |
| `order.cancelled` | Order cancelled | Sales/Dispatch | Dashboards, Notifications, Audit |

> *Derived* events (e.g. `order.fully_dispatched`) are emitted when the
> recomputed status crosses a threshold, alongside the explicit action event.

## Standing consumers

- **Audit** — records every event into the trail (the workflow timeline).
- **Notifications** — turns selected events into role/user alerts (e.g.
  `packing_slip.variance_detected` → Sales).
- **Dashboards / read models** — maintain queue counts, KPIs and projections.
- **Background jobs** — ERP/accounting sync, exports, document generation.
- **Future AI services** — consume events (+ documents) for parsing uploaded
  slips/invoices, variance/anomaly insights, and agentic assistance. They are
  consumers only; they never bypass the business-logic invariants.

## Rules

1. **One event per state change**, emitted transactionally via the outbox.
2. **Events are immutable facts**, named in the past tense, versioned for schema
   evolution.
3. **Consumers are idempotent** and independent — a slow/failed consumer never
   blocks the command or other consumers.
4. **No business rules in consumers** that belong in a module — consumers react;
   they don't re-implement ownership or variance logic.
5. The event catalogue is **append-only by convention**: add new events/versions
   rather than repurposing existing ones.
