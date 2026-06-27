# Native — Core Principles

| | |
|---|---|
| **Version** | 1.0 |
| **Status** | ✅ Implemented |
| **Last Updated** | 27 Jun 2026 |
| **Related ADRs** | ADR-0001 |
| **Related Modules** | All |

> These principles define the **product philosophy** of Native — how it should
> feel and behave. For the **engineering invariants** every module's code must
> obey, see [`business-logic-principles.md`](./business-logic-principles.md).
> When a design choice is hard, return here.

---

## 1. Workflow-driven, not screen-driven

Native models the *business process*, not a set of CRUD screens. A user is
always guided to the **single next action** for the work in front of them — the
contextual primary CTA (e.g. *Mark Ready for Dispatch → Mark Dispatched → Upload
Packing Slip → Upload Sales Invoice → Mark Delivered*). Screens are a
consequence of the workflow, never the starting point.

## 2. Every department has its own workspace

Sales, Dispatch, Warehouse and Accounts each see the orders they own, framed for
their job. The same underlying order renders differently depending on whose
workspace it's viewed in — Sales sees the commercial order; Dispatch sees pick
lists, packing and reconciliation. Ownership of an order **transfers** between
departments as work completes; it is never duplicated.

## 3. One source of truth

Each fact lives in exactly one place. The Sales Order (PI) is the authoritative
statement of what the customer requested. Fulfilment is *derived* from immutable
dispatch records — never stored as a second, hand-maintained number that can
drift. Quantity reconciliation has exactly one home (the Packing Slip step);
financial reconciliation has exactly one home (the Sales Invoice step).

## 4. Documents are never overwritten

Every stage creates a **new document linked to the previous one**, rather than
mutating an earlier document. The Sales Order is never edited after
confirmation. A shipment is a separate, append-only Dispatch Record. The Packing
Slip and Sales Invoice are distinct documents that reference the order. This
preserves a faithful history of what was requested vs. what shipped vs. what was
billed — and makes disputes resolvable.

## 5. Every important action creates an audit trail

Status transitions, dispatches, reconciliations and overrides are recorded with
**what changed, when, and by whom**. The workflow timeline is the human-readable
view of this trail. Nothing important happens silently.

## 6. Minimize duplicate data entry

Data entered once flows forward. Transporter and packing instructions captured at
*Ready for Dispatch* carry into the dispatch record. The Packing Slip screen is
pre-filled with the dispatched quantities. The Sales Invoice screen is pre-filled
with PI rates and amounts. Manual entry is the Phase-1 stand-in for an
integration feed — the screen stays identical when the ERP auto-fills it later.

## 7. Role-based interfaces

What you can see and do is determined by your role. Sales cannot edit a
shipment's quantities; Dispatch cannot rewrite the commercial order; Accounts
owns invoice reconciliation. Interfaces expose only the actions a role is
responsible for, reducing error and clarifying accountability.

## 8. Automation reduces work without hiding business decisions

Native automates the mechanical (computing variance, deriving status, carrying
data forward) but **surfaces** the decisions that matter. A colour-mix change or
an invoice mismatch is detected automatically and shown clearly — it is never
silently absorbed. Automation should never quietly make a call a human should
own. Warnings are non-blocking by default: Native records reality and flags it,
rather than preventing legitimate real-world events.

---

### Applying the principles

When proposing a feature, state explicitly how it honours these principles —
especially #3 (no second source of truth), #4 (new linked documents, no
overwrites) and #8 (surface decisions, don't bury them). A feature that violates
a principle needs either a redesign or a recorded decision (ADR) explaining the
deliberate exception.
