# Architecture — Sales Orders

> **Last updated:** 2026-06-27
> **Module owner:** Sales
> **Status:** Implemented (single-page app + local overlay)

## Purpose

The Sales Orders module is the entry point of every transaction. It records what
a customer has requested — the **Proforma Invoice (PI)** — and is the
authoritative statement of commercial intent for the rest of Native. Everything
downstream (dispatch, packing slip, invoice, payment) reconciles back to it.

The Sales Order is **immutable after confirmation**. It is never edited to match
what actually shipped or what was billed; instead, downstream documents record
those realities and are reconciled against the order.

## Users

- **Sales team** — own orders in the `Pending` state; confirm payment and
  dispatch instructions; hand orders to Dispatch.
- **Dispatch team** — read the order (and its packing instructions) but cannot
  change ordered quantities or rates.
- **Accounts** — consume the order for invoice reconciliation and receivables.
- **Management** — read-only oversight, customer intelligence, trends.

## Workflow

```
PI Created  ──►  Ready for Dispatch  ──►  Dispatched / Partially Dispatched
   (Sales)            (Sales hands               (Dispatch)
                       to Dispatch)                  │
                                                     ▼
                                          Packing Slip verified
                                                     │
                                                     ▼
                                          Sales Invoice verified
                                                     │
                                                     ▼
                                                 Delivered
```

The Sales module owns the first transition only:

1. **PI Created** — order exists in the master dataset with full line items.
2. **Mark Ready for Dispatch** — Sales confirms the order is cleared to leave the
   factory and captures the handover details (below). Ownership transfers to
   Dispatch. Everything after this is documented in [`dispatch.md`](./dispatch.md).

### Mark Ready for Dispatch (handover)

A modal captures, with validation:

- **Payment Status** — Pending / Partially Paid / Fully Paid *(required)*
- **Transporter** — searchable, free-add; remembered for reuse *(required)*
- **Packing Type** — Single / Double *(required)*
- **CC Attached** — Yes / No *(required)*
- **Samples** — None / Yes (+ quantity)
- **Remarks** — free text

This is the single point where Sales' dispatch instructions are captured; they
flow forward into the dispatch record and load sheet without re-entry.

## Documents

| Document | Created by | Mutability | Links to |
|---|---|---|---|
| **Sales Order (PI)** | Master sheet / Sales | Immutable after confirmation | Party, Sales Order Items |
| **Sales Order Item** | — | Immutable | Product hierarchy |
| **Ready handover** | Sales | Append (one per order) | Sales Order |

The Sales Order carries header fields (PI #, party, party code, salesperson/POC,
PI date, totals) and a list of **line items**, each with the full product
hierarchy (see [`../database/product-hierarchy.md`](../database/product-hierarchy.md)):
Product/Category, Model, Backing, Colour, Width, Length, plus quantity, units,
bill rate, actual rate, freight, taxable value and total.

## Statuses

Order status is **derived**, never stored as an editable field. It is computed
from the immutable order plus its overlay (handover, dispatch records, delivery):

| Status | Meaning | Owner |
|---|---|---|
| `Pending` | Created, not yet handed to Dispatch | Sales |
| `Ready for Dispatch` | Sales handover complete | Dispatch |
| `Partially Dispatched` | Some units shipped, more pending | Dispatch |
| `Fully Dispatched` | All ordered units shipped | Dispatch |
| `Delivered` | Goods confirmed received | Accounts |
| `Cancelled` | Terminal — cancelled in master sheet | Sales |
| `Repeat` | Terminal classification — repeat order | Sales |

A customer is shown a **Repeat Customer** badge only when they have more than one
order.

## Permissions

| Action | Sales | Dispatch | Accounts |
|---|---|---|---|
| Create / confirm PI | ✅ | — | — |
| Edit ordered quantities or rates | ❌ (immutable after confirm) | ❌ | ❌ |
| Mark Ready for Dispatch | ✅ | — | — |
| Record dispatch / packing slip | — | ✅ | — |
| Reconcile sales invoice | — | — | ✅ |
| Review/acknowledge variance | ✅ | view | view |

## Business Rules

1. **Immutability** — ordered quantities, rates and line items never change after
   the order is confirmed.
2. **Derived status** — status is always computed from documents, never set by
   hand (except terminal `Cancelled`/`Repeat` from the master).
3. **Single handover** — payment/transport/packing instructions are captured once
   at *Ready for Dispatch* and reused downstream.
4. **Fulfilment is reconciled, not edited** — what physically shipped or what was
   billed is recorded on separate documents and compared back to the order;
   the order itself is the unchanging reference.
5. **Product hierarchy is never flattened** — Product, Model, Backing and Colour
   are distinct fields; a value that merely repeats the product is dropped so the
   same word never appears twice.

## Notifications

- **Packing-slip variance banner** — when Dispatch's verified quantities differ
  from the order (colour-mix change, shortfall, over-ship or substitution), the
  order surfaces a non-blocking banner to Sales summarising the change, which
  Sales reviews ("Reviewed") before the invoice is finalised.
- **Contextual CTA hint** — each order shows the single next action and a short
  hint about who owns it.

## Future Roadmap

- **Order creation in-app** — today orders originate from the master dataset;
  Sales will create/edit PIs directly with validation against the party and
  product catalogue.
- **Credit & payment gating** — surface party outstanding/credit limit at
  *Mark Ready* and warn when an order would breach terms.
- **Backorders** — when an order is short-shipped and closed, optionally spawn a
  linked backorder for the remainder.
- **Quotation → PI** — a pre-order quotation stage that converts into a PI.
- **Server-backed persistence** — replace the browser-local overlay with a real
  datastore and the conceptual schema in [`../database/er-diagram.md`](../database/er-diagram.md).
