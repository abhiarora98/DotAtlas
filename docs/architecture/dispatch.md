# Architecture — Dispatch

| | |
|---|---|
| **Version** | 1.1 |
| **Status** | ✅ Implemented |
| **Last Updated** | 27 Jun 2026 |
| **Related ADRs** | ADR-0001, ADR-0002 |
| **Related Modules** | Sales Orders · Warehouse · Accounts · Inventory |

> **Module owner:** Dispatch · Persistence: single-page app + browser-local overlay (Phase 1)

---

## Purpose

The Dispatch module owns an order from the moment Sales hands it over until it is
delivered. It records **what physically leaves the factory**, reconciles that
against the Sales Order, produces the warehouse pick/load documents, and gates
delivery behind quantity and financial verification — all without ever mutating
the original order.

## Ownership transfer from Sales to Dispatch

Ownership is **derived from status**, not assigned manually:

- `Pending` → owned by **Sales**.
- `Ready for Dispatch`, `Partially Dispatched`, `Fully Dispatched` → owned by
  **Dispatch**.
- `Delivered` → owned by **Accounts**.

When Sales marks an order *Ready for Dispatch*, it leaves the Sales Orders queue
and appears in the Dispatch queue. The handover data (payment status,
transporter, packing type, CC, samples, remarks) travels with it — Dispatch does
not re-enter it.

## Partial dispatch workflow

A single order may ship in multiple loads. Each shipment is recorded as a
separate **Dispatch Record**; the order is never altered.

- Dispatch chooses **Full** (ship all remaining) or **Partial** (enter quantities).
- Quantities are entered colour-wise, grouped Product → Model · Backing · Size.
- Entry is **free and uncapped** — Dispatch may load *more* of a colour than
  ordered when the mix changes due to stock. Native records exactly what was
  loaded.
- Fulfilment (`Partially` vs `Fully Dispatched`) is computed cumulatively from
  all dispatch records; remaining quantity is shown until it reaches zero.

> **Note on variance:** colour-mix / quantity variance is **not** reconciled at
> dispatch-entry time. Dispatch records what was loaded; the formal quantity
> reconciliation happens once, at the **Packing Slip** step (below). This keeps
> quantity reconciliation in exactly one place (Principle #3).

## Dispatch records

Each Dispatch Record is append-only and captures:

- Sequence number, dispatch date & time.
- **LR / Docket number** *(required)*, vehicle, driver name & mobile.
- Transporter (carried from the Sales handover).
- Per-line shipped quantities (`{ orderLineId: qty }`), raw/uncapped.
- Any **substitutions** (a different SKU shipped in place of an ordered one).
- Remarks; recorded-by.

The original Sales Order is immutable; the set of Dispatch Records *is* the
shipment history.

## Packing Slip workflow (Step 1 — quantity verification)

Available once an order is **Fully Dispatched**. Purpose: verify **quantities and
products** — what physically left the factory — against the PI.

1. **Upload the packing slip** document. It is stored against the order as the
   source reference (viewable; persisted when small, metadata otherwise).
2. **Reconcile quantities** on the *same colour-wise editor* used at dispatch,
   **pre-filled with the dispatched quantities**. The dispatcher confirms or
   corrects each colour while reading the physical slip.
3. **Manual-entry products** — our packing slips do **not** list Foot Mats or
   Car Sets. Those lines are flagged `manual` and their dispatched quantities are
   keyed in by hand before the slip can be verified.
4. Native computes the **Packing Slip Variance** vs. the PI, classified as:
   - ▼ **Reduced** (a colour under its order),
   - ▲ **Increased** (a colour over its order),
   - ⇄ **Substituted** (a different SKU),
   - and a total line (*unchanged ✓* / *N short* / *+N over*).
5. A non-blocking **Variance Summary** is shown before confirming. Verification is
   never prevented — Native records reality.
6. On verify, the order is marked **Packing Slip Verified ✓**; any variance
   notifies Sales via the order banner for review before invoicing.

PI ↔ Packing Slip is the **only** quantity reconciliation. The invoice is **not**
used to verify quantities (invoice item names/descriptions may differ).

> *Comparison set:* PI ↔ Packing Slip identifies missing items, extra items,
> quantity differences, substitutions and partial dispatches.

## Sales Invoice workflow (Step 2 — financial verification)

Locked until the packing slip is verified. Purpose: ensure the invoice raised by
Accounts matches the **commercial intent** of the PI. Owned by **Accounts**.

1. **Upload the sales invoice** document (stored against the order) and capture
   the **invoice number**.
2. Reconcile **PI ↔ Sales Invoice** on a financial grid: per-line PI rate &
   amount vs. invoice rate & amount, with a live per-line and **total** variance.
3. Checks surfaced: invoice total mismatch, incorrect rates, incorrect taxable
   value, missing line items, extra line items, amount variance.
4. On verify, the order is marked **Sales Invoice Verified ✓** and the invoice
   number is reflected on the order summary.

## Load Sheet workflow

A printable warehouse document generated from an order ready/queued for dispatch:

- **Header** (PI #, party, transporter, date).
- **Packing instructions** (from the Sales handover) on top.
- **Material to pick**, grouped Product → Model · Backing → colours with
  quantities (remaining-to-pick when partially dispatched, else ordered).

Line-item commercial detail is intentionally excluded — the load sheet is a
picking/packing document, not a financial one. (See also
[`warehouse.md`](./warehouse.md).)

## Dispatch History

Per order, every shipment is shown as its own record telling the full
**Ordered → Dispatched → Remaining** story, computed cumulatively at that point
in time:

- A summary flow card (before → dispatched → remaining) per shipment.
- Grouped by Product → Model · Backing · Size, with **collapsible variants** when
  a group has many colours (avoids a wall of single-colour rows).
- Substitutions listed separately within the record.
- Colour coding: ordered (grey), dispatched (green), remaining (red until zero).

## Transporters

- Captured at *Mark Ready for Dispatch*; searchable with free-add.
- Remembered across orders for quick reuse.
- Carried into each dispatch record and the load sheet.

## Shipment Timeline

The workflow timeline is the audit trail for the order's journey, one step per
milestone with timestamp, updated-by and remarks:

```
PI Created → Ready for Dispatch → Dispatched → Packing slip verified
          → Sales invoice verified → Delivered
```

Each step is marked done / current / upcoming; elapsed time between stages is
shown. A partial dispatch keeps *Dispatched* as the in-progress step.

## Reconciliation panel & status gating

Within a dispatched order, a **Reconciliation** panel mirrors the two steps
(Packing Slip, then Sales Invoice — locked until the slip is verified), showing
state, attached documents and variance summaries. The contextual footer CTA
sequences the work:

```
Fully Dispatched → Upload Packing Slip → Upload Sales Invoice → Mark Delivered
```

## Business Rules

1. The Sales Order is never mutated; shipments are append-only Dispatch Records.
2. Quantity entry is free/uncapped — over-shipping a colour is allowed and
   recorded, not blocked.
3. Quantity reconciliation lives **only** in the Packing Slip step; financial
   reconciliation lives **only** in the Sales Invoice step.
4. The Sales Invoice is never used to verify quantities.
5. The invoice is based on what was actually dispatched/verified, not the raw PI.
6. All variance is non-blocking and fully recorded; Sales is notified to review.
7. Foot Mats and Car Sets require manual quantity entry during packing-slip
   verification (not present on our slips).

## Future ERP integration

The workflow is designed so manual upload is a temporary stand-in:

- **Phase 1 (now):** manual Packing Slip upload + manual Sales Invoice upload;
  quantities/amounts confirmed by hand on the reconciliation screens.
- **Phase 2:** the Inventory ERP sends Packing Slip data in real time and the
  accounting system syncs the Sales Invoice automatically. Native performs both
  reconciliations with no manual uploads. **The screens and workflow are
  identical** — only the data source changes (manual entry → integration feed).

## Future shipment tracking

- Additional timeline milestones (Reached Hub, Out for Delivery, Delivered) as
  new history kinds, without changing the structure.
- Transporter/LR tracking links and delivery-proof (POD) capture.
- Warehouse Mode for floor staff during picking/loading (see `warehouse.md`).
