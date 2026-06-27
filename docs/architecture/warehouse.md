# Architecture — Warehouse

| | |
|---|---|
| **Version** | 0.2 |
| **Status** | 🟡 In Progress |
| **Last Updated** | 27 Jun 2026 |
| **Related ADRs** | ADR-0001 |
| **Related Modules** | Dispatch · Inventory · Sales Orders |

> **Module owner:** Warehouse · Partially realised today via Dispatch's Load Sheet;
> a dedicated Warehouse workspace is on the roadmap.

---

## Purpose

The Warehouse module covers the **physical handling** of goods between *Ready for
Dispatch* and *Dispatched*: picking the right material, packing it to
instruction, and producing the documents that accompany a load. It is the
bridge between the commercial order and the truck.

Today, warehouse activity is driven through the Dispatch module's **Load Sheet**
and packing instructions. This document describes the intended dedicated
workspace so it can be built deliberately.

## Warehouse responsibilities

- **Pick** the material specified by the order (or the remaining quantity on a
  partial dispatch).
- **Pack** to the packing type and instructions set by Sales at handover.
- **Confirm** what was actually picked/packed so Dispatch can record an accurate
  shipment and the Packing Slip reconciliation reflects reality.
- **Hand off** the physically verified load (and its packing slip) to Dispatch.

## Picking

- Driven by a grouped pick view: Product → Model · Backing → colours, with the
  quantity to pick.
- On a partial dispatch, the pick list shows the **remaining-to-pick** quantity,
  not the full order.
- Foot Mats and Car Sets are handled as distinct categories; because they are not
  on our standard packing slips, their picked quantities are confirmed manually
  (this feeds the packing-slip manual-entry step in Dispatch).
- **Future — Warehouse Mode:** a floor-friendly, large-touch interface for
  pickers to tick items as they are pulled, surfacing shortfalls in real time.

## Packing

- Packing type (Single / Double) and any special instructions come from the Sales
  handover and are shown to the packer — never re-entered.
- Samples flagged at handover are included in packing.
- The packed result is what the Packing Slip records; discrepancies between
  ordered and packed are exactly what the packing-slip reconciliation surfaces.

## Load Sheets

A printable picking/packing document (implemented today in Dispatch):

- **Header** — PI #, party, transporter, date.
- **Packing instructions** on top.
- **Material to pick**, grouped, with quantities.
- Commercial detail (rates, amounts) is intentionally excluded — this is a floor
  document, not a financial one.

## Statuses (intended)

The Warehouse module reads the order's dispatch lifecycle rather than owning its
own top-level status. Intended internal sub-states for a pick/pack task:

| Sub-state | Meaning |
|---|---|
| `To Pick` | Order is Ready for Dispatch; material not yet pulled |
| `Picking` | Pull in progress (Warehouse Mode) |
| `Packed` | Picked & packed to instruction; ready for Dispatch to record |

These are warehouse-internal and roll up into the Dispatch statuses
(`Ready for Dispatch` → `Dispatched`).

## Permissions

| Action | Warehouse | Dispatch | Sales |
|---|---|---|---|
| View pick/load sheet | ✅ | ✅ | view |
| Confirm picked/packed quantities | ✅ | ✅ | ❌ |
| Set packing instructions | ❌ | ❌ | ✅ (at handover) |
| Record the shipment (LR/vehicle) | ❌ | ✅ | ❌ |

## Business Rules

1. Warehouse confirms physical reality; it does not change the Sales Order.
2. Packing instructions originate from Sales and are read-only on the floor.
3. Picked/packed confirmation should be the single input that the Packing Slip
   reconciliation builds on — minimizing duplicate entry (Principle #6).

## Future inventory integration

- **Inventory ERP** becomes the system of record for stock on hand; Native's pick
  lists check availability and flag shortfalls before picking begins.
- **Real-time Packing Slip data** flows from the Inventory ERP into Dispatch's
  packing-slip step, replacing manual confirmation with an automatic feed — the
  reconciliation workflow is unchanged.
- **Stock movements** (reservations on *Ready for Dispatch*, depletion on
  *Dispatched*) keep inventory accurate without separate data entry.
- **Bin/location & batch tracking** to guide pickers and support traceability.
