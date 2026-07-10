# Architecture — Price Lists

| | |
|---|---|
| **Version** | 1.0 |
| **Status** | ✅ Implemented (standalone; Sales Order integration next) |
| **Last Updated** | 10 Jul 2026 |
| **Related ADRs** | ADR-0001, ADR-0006, ADR-0007 |
| **Related Modules** | Product Master · Parties · Sales Orders |

> Price Lists own the **commercial rate that varies by customer or market** —
> nothing else. Product identity and tax (SKU, HSN, GST, Sq.Ft., Weight) stay in
> [Product Master](./product-master.md). Native **computes** per-roll / per-piece
> totals from the rate — there is one source of truth for pricing (ADR-0007).

---

## Purpose

Hold per-customer/market selling **rates** (₹/sqft for rolls, ₹/piece for
footmats & car sets) as override lists layered over Product Master's default
rate, so Sales Orders can resolve the right price automatically without the
salesperson choosing prices.

## Users

- **Pricing / Admin** — create and maintain price lists and overrides.
- **Sales** — read-only; a Party's assigned list drives Sales Order pricing.

## Navigation

Under **`MASTER DATA`**: Party Master · Product Master · **Price Lists** ·
Transporters *(future)* · Employees *(future)*.

## Workflow

```
Product Master (default rate, Sq.Ft., GST, HSN)
        │  inherit
        ▼
Price List (override rate where it differs)
        │  assigned to
        ▼
Party ──► Sales Order  (resolves rate automatically — next milestone)
```

## Documents / data model

**Price List:** `id`, `name`, `description`, `status`, `system` (seeded vs
custom), **`isDefault`** (the single company-wide default), `createdBy`,
`createdOn`, `updatedBy`, `updatedOn`, `currency` *(future)*, `effectiveDate`
*(future)*, `overrides` (map: **price group → rate**), `parties` (assigned party
references).

### Company default price list (`isDefault`)
Exactly **one** list carries `isDefault = true` (seeded on **Default**). A
**⭐ Default** badge marks it; a **Set as Default** action (list header) promotes
another list — clearing the previous flag, setting the new one, and confirming
*"Default price list changed successfully."* (disabled when already default).
**All pricing resolves the default via `isDefault`** (not a hardcoded/first
record) — Product Master, and future Sales Orders, Quotations, Proforma Invoices
and any pricing calculation. Effective default rate = `defaultList.overrides[g] ??
Product Master base rate[g]`.

**Override-only.** A list stores *only* the rates that differ from the default.
Products without an override inherit the Product Master default rate — no list
duplicates the catalogue. Overrides are keyed by **price group** (the colour-
independent base), consistent with Product Master (ADR-0006).

### Seeded lists
**Default** (mirrors Product Master; no overrides) · **Dealer** · **Distributor**
· **Institutional** · **Export** · **Government**. Users can create unlimited
custom lists.

### Pricing unit & computation
- **Rolls** → rate is **₹/Sq.Ft.**; `price = rate × Sq.Ft.` (Sq.Ft. from Product
  Master).
- **Footmats / Car Sets** → rate is **₹/Piece**; the piece price *is* the rate.

Totals are **computed, never stored** (ADR-0007) so a Sq.Ft. change re-prices
everything automatically.

### Price resolution
```
effective rate = priceList.overrides[group]  ??  ProductMaster.default rate[group]
effective price = effective rate × (Sq.Ft. for rolls | 1 for pieces)
```

## Module surfaces

### Dashboard
Total Price Lists · Active Price Lists · Parties Assigned · Products with Custom
Prices · Recently Updated.

### Price List management
Cards/rows for each list (name, description, status, #overrides, #parties,
updated) + **New Price List**.

### Product Pricing screen (per list)
Columns: **Product · HSN · Unit · Sq.Ft. · GST % · Default rate · Override rate ·
Computed price · Difference · Updated** — with **Search**, **Filters** and **Bulk
Update**; Import / Export *(future)*. **HSN and GST are read-only, mirrored from
Product Master** (they update automatically when changed there and are never
editable here), so tax is visible during price verification, export and order
creation. Rows are price groups (a base covers its colour variants). The
seeded **Default** list is read-only (it *is* the base).

## Statuses

| Status | Meaning |
|---|---|
| `Active` | In use; can drive Sales Order pricing |
| `Draft` | Being prepared |
| `Archived` | Retained, not used for new orders |

## Permissions

| Action | Pricing/Admin | Sales | Others |
|---|---|---|---|
| Create / edit list & overrides | ✅ | ❌ | ❌ |
| Assign list to a party | ✅ | ❌ | ❌ |
| Read resolved price | ✅ | ✅ | ✅ |

## Business Rules

1. **Override-only** — never duplicate the catalogue; inherit the default rate.
2. **Rate, not total** — store ₹/sqft or ₹/piece; compute per-roll/piece on read
   (single source of truth with Product Master's Sq.Ft.).
3. **Tax stays in Product Master** — GST/HSN are product attributes, never per
   list.
4. **Sales Orders contain no pricing logic** — they resolve the rate via the
   party's assigned list.
5. **Group-keyed overrides** — one rate covers a base's colour variants
   (consistent with Product Master).

## Notifications

- Dashboard surfaces lists needing attention (few overrides, none assigned) and
  recently updated lists. *(Future: approval-required changes.)*

## Future Roadmap

Architecture supports, but v1 does **not** implement: customer-specific overrides,
quantity-break pricing, promotional pricing, date-effective pricing, region-wise
pricing, multi-currency, and approval workflows. Next milestone: **Sales Order
rebuild** consuming `Party → assigned Price List → Product Master + Price List`.
