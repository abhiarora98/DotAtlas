# 0002 — Split dispatch reconciliation into Packing Slip + Sales Invoice

- **Status:** Accepted
- **Date:** 2026-06-27

## Context

Dispatch ships what is physically loaded, which in reality often differs from the
order — colour mix changes due to stock, shortfalls, over-shipments and
substitutions happen daily. We needed Native to record this cleanly with a full
audit trail, and to ensure the invoice reflects what actually shipped.

An earlier iteration reconciled colour-mix variance **at dispatch-entry time** and
treated it as its own feature. This risked two separate quantity-reconciliation
systems and conflated *quantity* verification with *financial* verification.

## Decision

Separate **quantity verification** from **financial verification** into two
sequential steps after an order is Fully Dispatched:

1. **Packing Slip (quantity).** Upload the packing slip; reconcile PI ↔ Packing
   Slip on the colour-wise editor, pre-filled with dispatched quantities. This is
   the **single home** for quantity reconciliation — the dispatch-time variance
   was folded into it, not kept independent. Foot Mats / Car Sets (absent from
   our slips) are entered manually. Variance is classified (reduced / increased /
   substituted / total) and is **non-blocking**; Sales is notified to review.
2. **Sales Invoice (financial),** locked until the slip is verified. Upload the
   invoice; reconcile PI ↔ Invoice on rates, amounts, taxable value and total.
   The invoice is **never** used to verify quantities (descriptions differ).

Phase 1 uses manual uploads + manual confirmation. Phase 2 replaces manual entry
with Inventory-ERP and accounting-system feeds — **the screens and workflow are
identical**, only the data source changes.

## Consequences

- Quantity reconciliation lives in exactly one place (Principle #3); the shared
  colour-wise editor backs both dispatch entry and packing-slip verification.
- A clean separation of concerns that maps directly onto future integrations.
- Delivery is gated behind reconciliation via the contextual CTA sequence
  (Fully Dispatched → Packing Slip → Sales Invoice → Delivered). This is a
  deliberate default; if real operations need delivery before invoice
  reconciliation, revisit with a follow-up ADR.
- The Sales Order remains immutable; packing slip and invoice are separate linked
  documents, preserving requested vs. shipped vs. billed.

See [`../architecture/dispatch.md`](../architecture/dispatch.md) for the full
workflow.
