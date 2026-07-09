# 0006 — Pricing architecture: price groups + a future Price List module

- **Status:** Accepted
- **Date:** 2026-07-09

## Context

The V1/V2 seed generated 532 variants by cross-producing each spec base row
(Category + Model + Backing + Width + Length) across its colour pool. Price in the
spec varies by base row, **not by colour**, so every colour variant ended up
storing an identical copy of its base price — 532 stored prices for ~109 distinct
values. This is duplicated data that makes future price updates error-prone.

We also need to scope what pricing Product Master owns versus a future Price List
module, and correct the GST defaults.

## Decision

1. **Price groups (no duplicated pricing).** The **Default Selling Price** is
   stored **once per price group** — the colour-independent base
   (`Category | Model/Height | Backing | Type | Width | Length | Size`). Every
   variant references its `priceGroup` and **inherits** the group price. Updating
   one price updates every variant that shares it. (532 variants → 109 groups.)

2. **Product Master owns only base pricing:** **Default Selling Price · Default
   Cost (future) · GST · HSN.** Freight and Landed Cost are **removed** from
   Product Master.

3. **Tiered/contextual pricing lives in a future Price List module**, not Product
   Master: Dealer, Distributor, Customer-specific, Quantity-break, Export,
   Institutional, etc. Product Master stays the single source of the *default*
   price; Price Lists layer on top.

4. **GST defaults corrected:** **Artificial Grass → 5%**, **all other categories →
   18%.** Editable per product in Product Master; these are the creation defaults.

## Consequences

- `products.json` gains a top-level `priceGroups` map and each product a
  `priceGroup` key; per-variant `sellingPrice`/`freight`/`landed` are removed.
- The effective selling price is resolved as `override ?? priceGroups[group]`; the
  local overlay stores group-level edits (`atlas-products-overlay.priceGroups`),
  so editing a base price updates all its variants at once.
- The backend model adds a **PriceGroup** concept and reserves **Price List** as a
  separate module owning tiered pricing (see `docs/backend/database-design.md`,
  `docs/backend/module-boundaries.md`).
- No duplicated pricing logic: one place computes/stores the default price; other
  modules read it; future Price Lists compute derived prices from it.
