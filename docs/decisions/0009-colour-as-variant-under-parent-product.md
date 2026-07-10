# 0009 — Colour as a variant under a parent product

- **Status:** Accepted
- **Date:** 2026-07-10
- **Refines:** ADR-0004, ADR-0005 (Product Master model) and the pricing ADRs
  0006/0007/0008 (which continue to hold — pricing still lives at the group /
  parent level, resolved only at document creation).

## Context

The original catalogue flattened every colour into its own top-level SKU
(532 products), which duplicated identical specifications across colours. An
updated master price spec (`PRODUCT_SPEC__UPD`) became the new source of truth
and prompted a rethink: **we manage inventory and production by colour**, so
colour cannot be a mere display attribute — but neither should each colour be a
separate product that repeats the parent's dimensions, HSN, GST and price.

## Decision

1. **Two-level hierarchy — parent product → colour variant.**
   - The **parent product** holds everything common: name, category, model /
     height, backing / type, dimensions (width × length or size), Sq.Ft.,
     weight, HSN, GST, specifications, images, documents, BOM, manufacturing,
     and the **base rate**. Its SKU is **colour-independent**
     (e.g. `LP-ALTO-DIA-061X15`).
   - Each **colour variant** carries its own **SKU** (parent SKU + colour code,
     e.g. `LP-ALTO-DIA-061X15-BEI`), plus its own **stock, production planning
     and availability**. Pricing is **inherited from the parent base rate unless
     an explicit per-variant override** is set.

2. **Downstream documents reference the variant.** Sales Orders, Purchase
   Orders and Production Orders always reference the **colour variant SKU** (they
   plan and move stock by colour). Common product information and pricing are
   read from the parent unless the variant overrides them.

3. **Product Master remains the single source of truth for specifications;**
   Price Lists remain responsible only for commercial pricing. Price resolution
   is unchanged (ADR-0008): party list → default list → parent base rate; the
   resolved rate applies to whichever variant is on the document.

4. **Updated-spec import rules.**
   - Import all products, specifications, Sq.Ft., weights and dimensions from the
     updated spec.
   - **HSN / GST:** Artificial Grass & Mono Grass → **HSN 57033100, GST 5 %**;
     **all other categories → HSN 39189090, GST 18 %**.
   - **Retail** column → Product Master **Base Rate**.
   - **Bulk** column → seeds a system **Bulk** price list (override-only).
   - Colour is **not** duplicated into separate SKUs — it becomes the variant.

## Consequences

- `products.json` moves to **schemaVersion 3**: `products` are **parents** each
  with a `variants[]` array (`{id, sku, colour, status, rateOverride, stock,
  availability}`). 124 parents / 516 variants replace the old 532 flat SKUs.
  `priceGroups` (parent base rate) and a new `priceListSeeds.bulk.overrides`
  (the Bulk column) are emitted alongside.
- Product Master UI gains a **Variants** tab (colour, variant SKU, stock,
  availability, inherited/override rate); the list shows a colour **count** with
  swatches; parent SKU/name drop colour; the colour filter and universal search
  match variant colours. The overlay key bumps to `native-products-overlay-v3`
  so pre-v3 per-colour edits don't merge onto the new parents.
- The Price Lists module seeds a **Bulk** list from `priceListSeeds` on first
  run (override-only, keyed by price group), sitting beside Default / Dealer /
  Distributor / Institutional / Export / Government.
- Inventory & Production (future) attach stock and work orders to the **variant**
  without further catalogue changes — the hierarchy was the missing seam.
- Stock / production / availability on the variant are **placeholders** today,
  wired when those modules land.
