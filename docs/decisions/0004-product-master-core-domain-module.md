# 0004 — Product Master as a core domain module (Master Data)

- **Status:** Accepted
- **Date:** 2026-07-09

## Context

Products are referenced by nearly every module — Sales, Inventory, Dispatch,
Warehouse, Production, Purchase, Pricing, CRM. Until now product data was
*implied* by order line-item attributes; there was no authoritative catalogue.
The client provided a Product Master spec (categories with **category-specific
attributes**, SKUs, HSN/GST, pricing) and asked for a standalone module that
becomes the single source of truth before we wire products into Create Sales
Order.

Two structural questions came with it: (1) where the module lives in the app, and
(2) how to model products when different categories have genuinely different
attributes (Loop has backing; Tefno doesn't; Artificial Grass has height + SL/DL
type; Footmats have a size, not width/length).

## Decision

1. **Product Master is a core domain module, not a settings page.** It is the
   single source of truth for every product; all other modules *consume* it and
   none maintain their own product definitions. It is built standalone first and
   integrated with Create Sales Order in a later phase.

2. **Introduce a `MASTER DATA` navigation section** (separate from Settings) for
   foundational business data: **Party Master, Product Master**, and future
   **Price Lists, Transporters, Employees**. This mirrors mature ERPs and gives
   Native a natural home for master data as it grows.

3. **Category-specific attribute schema.** The catalogue does **not** force the
   same fields on every product. Each category declares which attributes apply:
   - **Loop:** Model · Backing · Width · Length · Colour
   - **Tefno:** Model · Width · Length · Colour
   - **Turf / Wire Mat:** Model · Width · Length · Colour
   - **Artificial Grass:** Height · Type (SL/DL) · Width · Length · Colour
   - **Mono Grass:** Model · Backing · Width · Length · Colour
   - **Footmat:** Model · Backing · Size · Colour
   Shared fields (SKU, Unit, Weight, SqFt, HSN, GST, Selling Price, Active, Notes)
   apply to all. This is driven by the documented product hierarchy.

4. **Deterministic SKU per product**, generated from its attributes and unique
   across the catalogue (e.g. `LP-ALTO-DIA-061X15-BEI`).

## Consequences

- A new `products` dataset (`public/data/products.json`) seeded from the client's
  Product Spec (532 products across 7 categories) plus a local overlay for
  edits/additions — mirroring the orders overlay pattern until the backend lands.
- The backend **Products/Catalogue** module (see `docs/backend/module-boundaries.md`)
  is now concretely the **Product Master**: the only writer of products; everyone
  else reads by SKU. No module hardcodes product information.
- Create Sales Order, Inventory, Dispatch, Warehouse and Production will all
  generate their product choices from Product Master (next phase).
- The `docs/database/product-hierarchy.md` and architecture dashboard are updated;
  a new `docs/architecture/product-master.md` module document is added.
