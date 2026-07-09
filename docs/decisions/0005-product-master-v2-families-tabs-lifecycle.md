# 0005 — Product Master V2: families, tabs, lifecycle & SKU locking

- **Status:** Accepted
- **Date:** 2026-07-09
- **Supersedes parts of:** ADR-0004 (extends it; the "core domain module" decision stands)

## Context

The V1 Product Master (ADR-0004) is a solid flat catalogue. Before integrating it
with Create Sales Order, we want it to be a **complete** master that can support
the whole ERP for years: catalogue completeness visibility, product families,
richer lifecycle, images/documents, BOM & manufacturing data, product
relationships, an audit trail, and a layout that anticipates future ERP features
without redesign.

## Decision

1. **Product Families.** Products are grouped into families rather than treated as
   isolated SKUs. A **Family** = Category + Model (e.g. `Loop · Cirro`); its
   **Variants** are the Backing/Type/Width/Length/Size/Colour permutations. Family
   is a first-class grouping for filtering, management and reporting.

2. **Status lifecycle.** Replace Active/Inactive with a four-state lifecycle:
   **Draft → Active → Discontinued → Archived** (with reactivation paths). See the
   product state machine in `docs/backend/state-machine.md`.

3. **Tabbed Product Details.** The single long form becomes a tabbed layout so
   future features slot in without redesign: **General · Specifications · Pricing ·
   Images · Documents · BOM · Manufacturing · Relationships · Inventory · Sales
   History · Purchase History · Audit Log · Analytics.** Some tabs are functional
   now; others are structured placeholders that future modules will fill.

4. **SKU locking.** SKU is auto-generated and **editable only until the product is
   first used** — then **locked forever**. "Used" = referenced by any Sales Order,
   Inventory Transaction or Production Record (and, as a present-day proxy until
   those exist, once the product leaves Draft into the live catalogue). A
   `skuLocked` flag records this; the UI prevents edits once set.

5. **Future-ready structures stored now.** BOM (raw materials, qty, unit, scrap %,
   production line, machine, cycle time, packing), Manufacturing (line, machine, QC
   template, packing type, default warehouse, reorder/min/max), Images (multiple,
   typed, primary, ordered), Documents (typed attachments), and Relationships
   (compatible / accessories / replacement / upgraded-by / discontinued-by) are
   captured as data even though the consuming modules (Production, Inventory) are
   not built. **No Production logic is implemented** — only the structure.

6. **Audit trail.** Every product stores Created By/On and Updated By/On now; full
   change history is future.

7. **Analytics tab.** A read-only per-product analytics surface (placeholder cards
   now) so that, once reporting exists, **every product becomes its own
   dashboard** — the capability that distinguishes a manufacturing ERP from simple
   inventory.

## Reaffirmed architecture rule

Product Master is **the single source of truth**. Sales Orders, Inventory,
Dispatch, Warehouse, Production, CRM, Purchase and future modules reference
**Product IDs / SKUs** from Product Master and never maintain independent product
definitions or hardcode product attributes.

## Consequences

- `products.json` gains `status`, `name`, `family`, `skuLocked` and an audit stub;
  rich containers (images, documents, bom, manufacturing, relationships) default
  empty in code and are stored in the local overlay when set — keeping the seed
  lean until the backend lands.
- The backend data model (`docs/backend/database-design.md`) gains ProductFamily,
  ProductImage, ProductDocument, ProductBom(+lines), ProductRelationship, a status
  enum, `skuLocked`, and audit columns — anticipated by this UI's data shape.
- `docs/architecture/product-master.md` is rewritten to v2; the hierarchy doc gains
  the Family layer; the dashboard reflects the new version and scope.
