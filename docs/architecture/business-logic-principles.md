# Native — Business Logic Principles

| | |
|---|---|
| **Version** | 1.0 |
| **Status** | ✅ Implemented |
| **Last Updated** | 27 Jun 2026 |
| **Related ADRs** | ADR-0001, ADR-0002 |
| **Related Modules** | All |

> These are the **engineering invariants** every module must obey — the rules
> that keep the system consistent as it grows and that will shape the backend.
> Where [`native-principles.md`](./native-principles.md) describes how Native
> should *feel*, this describes how it must *work*. A change that violates one of
> these needs a recorded ADR explaining the deliberate exception.

---

## 1. Business logic exists in one place only

A rule is implemented **once** and reused everywhere. No copy-pasted variants
that drift apart. Concretely:

- **One variance engine** computes quantity variance for both dispatch entry and
  packing-slip verification (today: a shared editor + `qtyVarianceData`). A
  second quantity-reconciliation path must never be introduced.
- **One status-derivation function** decides an order's status from its
  documents. No module sets status by hand.
- **One product-unit rule** (rolls / pcs / sets) — see
  [`../database/product-hierarchy.md`](../database/product-hierarchy.md).

When the backend arrives, each such rule becomes a single service/function, not a
behaviour re-coded per endpoint or per client.

## 2. Documents are immutable

A confirmed document is never edited in place. Corrections and progress create
**new documents linked to the previous one**:

- The Sales Order (PI) is frozen after confirmation.
- A shipment is an append-only Dispatch Record — never an edit to the order.
- The Packing Slip and Sales Invoice are separate documents that reference, but
  never mutate, the order.

This guarantees *requested vs. shipped vs. billed vs. paid* is always
reconstructable.

## 3. Derived state is computed, never stored twice

Anything that can be calculated from source documents (fulfilment totals,
remaining quantity, order status, variance) is **derived on read**, not persisted
as an independent field that could disagree with its source. The source documents
are the only writable truth.

## 4. Every state-changing action creates an audit trail

Each transition records **what changed, when, and by whom**, appended to the
order's history (the workflow timeline is its human view). Nothing important
happens silently; history is append-only.

## 5. One source of truth per fact — especially inventory

Each fact has exactly one owning system:

- **Ordered quantities & commercials** → Sales Order.
- **What physically shipped** → Dispatch Records / Packing Slip.
- **What was billed** → Sales Invoice. **What was paid** → Payments.
- **Stock on hand** → Inventory (planned). When Inventory lands, no other module
  keeps its own stock count; all reads/decrements go through it.

## 6. Quantity and financial verification are separate

- **Quantity** is verified only by **PI ↔ Packing Slip**.
- **Money** is verified only by **PI ↔ Sales Invoice**.

An invoice is never used to check quantities (item names differ); a packing slip
is never used to check amounts. Keep the two reconciliation engines distinct.

## 7. Ownership transfers; documents are not rewritten across departments

An order moves between departments by **changing ownership** (derived from
status), not by one department editing another's document. Sales hands to
Dispatch; Dispatch hands (via verified invoice) to Accounts. Each department adds
its **own** linked document rather than mutating the upstream one.

## 8. Warnings are non-blocking; reality is always recordable

Real-world events — colour-mix changes, shortfalls, over-shipments,
substitutions, amount mismatches — are **detected and surfaced**, never
prevented. Native records what actually happened and flags it for the responsible
role to review. Hard blocks are reserved for genuine data-integrity violations
(e.g. a missing required identifier), not for business judgement calls.

## 9. Minimize duplicate entry; data flows forward

Data captured once propagates: handover details → dispatch record → load sheet;
dispatched quantities → packing-slip pre-fill; PI rates → invoice pre-fill.
Manual entry is a Phase-1 stand-in for an integration feed and the screen stays
identical when the feed replaces it.

## 10. Identifiers are stable and explicit

Entities are referenced by stable identifiers (order line `ono`, dispatch
sequence, SKU for a variant), never by display strings. Display text (e.g. a
colour label that also carries a "manual" badge) is never parsed to recover data.

---

### Using this document

Every new feature's architecture doc should state how it complies — particularly
#1 (no duplicate logic), #2 (no overwrites), #5 (single source of truth) and #6
(separate verification engines). These principles are the contract the backend
will be built to enforce.
