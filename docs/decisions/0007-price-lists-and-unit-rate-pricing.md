# 0007 — Price Lists module + unit-rate pricing (compute totals)

- **Status:** Accepted
- **Date:** 2026-07-10
- **Refines:** ADR-0006 (price groups). The "Default Selling Price" per group
  becomes a **default rate per unit**; totals are computed, not stored.

## Context

We need customer/market pricing without duplicating product data or letting per-
roll prices drift when a product's dimensions change. Two decisions:

1. **What unit is priced.** A roll's saleable price depends on its square footage.
   Storing both a per-sqft rate *and* a per-roll price means two values that can
   fall out of sync when the sqft changes.
2. **Where pricing lives.** Product identity/tax (SKU, HSN, GST, Sq.Ft., Weight)
   belong to Product Master; the commercial rate that varies by customer/market
   belongs to Price Lists.

## Decision

### Unit-rate pricing (single source of truth)
Price is stored as a **rate per pricing unit**, and Native **computes** totals:

- **Rolls** (LOOP/TEFNO/TURF/WIRE/MONO/GRASS): rate is **₹ per Sq.Ft.**
  → `roll price = rate × Sq.Ft.` (Sq.Ft. from Product Master).
- **Footmats / Car Sets**: rate is **₹ per Piece** → the piece price *is* the rate
  (no calculation).

The per-roll / per-piece **total is never stored** — it is derived on read, so
changing a product's Sq.Ft. updates every price automatically. Product Master's
group price (ADR-0006) is therefore a **default rate**, not a per-roll amount.

### Ownership
- **Product Master owns:** SKU, Product Name, Category, Specifications, Unit,
  **HSN, GST, Sq.Ft., Weight, Default rate (optional fallback)**. HSN/GST are
  product attributes — they do not change per customer.
- **Price Lists own:** the **selling rate** (₹/sqft or ₹/piece) per product, per
  list. Overrides only — see below.
- **Sales Orders own:** quantity, customer, selected products — **never pricing
  logic** (they read the resolved rate).

### Price Lists module (Master Data)
- Seeded system lists: **Default, Dealer, Distributor, Institutional, Export,
  Government**; users can create unlimited custom lists later.
- **Override-only storage.** A list stores only the rates that differ from the
  default; products with no override inherit the default rate. No list duplicates
  the whole catalogue.
- **Resolution order:** `list override (by price group) → Product Master default
  rate`. A Party is assigned a Price List; Sales Orders resolve the rate via that
  list automatically (next milestone — no manual price selection).
- Overrides are keyed by **price group** (colour-independent base), consistent
  with Product Master (ADR-0006) — one rate covers a base's colour variants.

### First version stays simple
One rate override per product per list. **Not** in v1 (architecture supports them
later): customer-specific overrides, quantity breaks, promotions, date-effective
pricing, region pricing, multi-currency, approval workflows.

## Consequences

- `products.json` price groups become `{ rate, unit }` (rate from the spec's
  *Price Per Sqft* for rolls / *Price* for footmats); the stored per-roll value is
  removed. Product Master's Pricing tab shows the rate + a computed per-roll price.
- New `native-pricelists` overlay: `{ lists: { id → { …meta, overrides: { group →
  rate }, parties: [] } } }`.
- The backend gains **PriceList** and **PriceListItem** (override) entities and a
  `Party.priceListId`; totals remain computed. See
  `docs/backend/database-design.md` and `docs/architecture/price-lists.md`.
- Sets up the next milestone: rebuild Sales Orders as
  `Party → assigned Price List → Product Master + Price List → Sales Order`.
