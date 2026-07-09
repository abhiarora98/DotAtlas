# Architecture — Product Master

| | |
|---|---|
| **Version** | 1.0 |
| **Status** | ✅ Implemented (standalone; SO integration next phase) |
| **Last Updated** | 09 Jul 2026 |
| **Related ADRs** | ADR-0001, ADR-0004 |
| **Related Modules** | Sales Orders · Inventory · Dispatch · Warehouse · Production · Pricing · CRM |

> Product Master is the **single source of truth for every product in Native**. It
> is a **core domain module**, not a settings page: every other module consumes
> product data from here and none maintains its own definitions. Driven by the
> documented [product hierarchy](../database/product-hierarchy.md).

---

## Purpose

Hold the authoritative catalogue of products — their category-specific attributes,
SKU, unit, weight, area, tax and price — so that Sales, Inventory, Dispatch,
Warehouse, Production, Purchase, Pricing and CRM all reference the **same** product
by the **same SKU**. No module hardcodes product information.

## Users

- **Catalogue / Admin** — create, edit, activate/deactivate products.
- **Everyone else** — read-only consumers (Sales picks products onto orders,
  Inventory stocks by SKU, Dispatch/Warehouse pick by SKU, etc.).

## Navigation

Product Master lives under a dedicated **`MASTER DATA`** sidebar section (not
Settings): **Party Master · Product Master · Price Lists (future) · Transporters
(future) · Employees (future)**. This mirrors mature ERPs and groups all
foundational business data (ADR-0004).

## Workflow (module surfaces)

**Dashboard** — Total Products · Active Products · Categories · Recently Added ·
Quick Actions (Add Product, jump to filters).

**Product List** — Search · Category filter · Model filter · Status filter · Bulk
actions (activate/deactivate) · Import / Export *(future)* · paginated table.

**Product Details / Editor** — full record with **category-specific** attribute
fields; Add and Edit flows; SKU auto-generated; Active/Inactive toggle; notes.

## Documents / data model

A **Product** is a catalogue record identified by a stable **SKU**. Fields:

**Shared (all categories):** `sku`, `category`, `colour`, `unit`, `weight`,
`sqft`, `hsn`, `gst`, `sellingPrice`, `active`, `notes` (+ `productImage` future).

**Category-specific attributes** (only the applicable fields are shown/required):

| Category | Attributes |
|---|---|
| Loop | Model · Backing · Width · Length · Colour |
| Tefno | Model · Width · Length · Colour |
| Turf | Model · Width · Length · Colour |
| Wire Mat | Model · Width · Length · Colour |
| Artificial Grass | Height · Type (SL / DL) · Width · Length · Colour |
| Mono Grass | Model · Backing · Width · Length · Colour |
| Footmat | Model · Backing · Size · Colour |

Seed data: `public/data/products.json` (532 products across 7 categories, derived
from the client Product Spec). Edits/additions/status changes persist to a
browser-local overlay (`atlas-products-overlay`) layered over the static seed —
the same pattern as orders — until the backend Product Master lands.

See [`product-hierarchy.md`](../database/product-hierarchy.md) for the hierarchy,
variant and SKU-generation rules.

## Statuses

| Status | Meaning |
|---|---|
| `Active` | Sellable / usable by other modules |
| `Inactive` | Retained for history but not offered in new documents |

## Permissions

| Action | Catalogue/Admin | Other roles |
|---|---|---|
| Create / edit product | ✅ | ❌ |
| Activate / deactivate | ✅ | ❌ |
| Read / select product | ✅ | ✅ (read-only) |

## Business Rules

1. **Single source of truth.** Products exist only here; other modules reference
   by SKU and never define their own product data (Principle #5).
2. **Category-specific attributes.** The editor shows only the fields that apply
   to the chosen category; irrelevant fields are neither shown nor stored.
3. **Deterministic, unique SKU.** Generated from the product's attributes and
   unique across the catalogue; stable once assigned.
4. **Deactivate, don't delete.** Products referenced by history are deactivated,
   not removed, so past documents stay resolvable.
5. **Tax & price are catalogue data** (HSN, GST %, default selling price), editable
   here and read elsewhere.

## Notifications

- Dashboard surfaces recently-added products and category coverage.
- (Future) alerts for missing tax/price fields or duplicate attribute combinations.

## Future Roadmap

- **Create Sales Order integration** — SO product dropdowns generated dynamically
  from Product Master (next phase); then Inventory (stock by SKU), Dispatch/
  Warehouse (pick by SKU) and Production (BOM by SKU).
- **Import / Export** — bulk load/update from the Product Spec sheet.
- **Product images**, richer pricing (price lists per party/tier), and a formal
  attribute-lookup catalogue (valid Model/Backing/Colour/Size combinations).
- **Backend Product Master** on PostgreSQL/Prisma (see
  [`../backend/database-design.md`](../backend/database-design.md)) — the schema
  this module's data model already anticipates.
