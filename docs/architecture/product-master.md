# Architecture — Product Master

| | |
|---|---|
| **Version** | 2.0 |
| **Status** | ✅ Implemented (standalone; SO integration next phase) |
| **Last Updated** | 09 Jul 2026 |
| **Related ADRs** | ADR-0001, ADR-0004, ADR-0005, ADR-0006 |
| **Related Modules** | Sales Orders · Inventory · Dispatch · Warehouse · Production · Purchase · Price Lists · CRM |

> Product Master is the **single source of truth for every product in Native** — a
> core domain module, not a settings page. Every other module references products
> **by Product ID / SKU** and none maintains its own definitions or hardcodes
> product attributes. V2 makes it a complete catalogue platform: product families,
> a real lifecycle, tabbed details, images, documents, BOM & manufacturing data,
> relationships, audit and per-product analytics.

---

## Purpose

Hold the authoritative catalogue so Sales, Inventory, Dispatch, Warehouse,
Production, Purchase, Pricing and CRM all reference the **same** product by the
**same SKU**, with enough structure to run the ERP for years without redesign.

## Users

- **Catalogue / Admin** — create, edit, families, lifecycle, images, BOM, etc.
- **Everyone else** — read-only consumers (pick products onto orders, stock by
  SKU, pick by SKU, build BOMs, report per product).

## Navigation

Under the dedicated **`MASTER DATA`** section: Party Master · **Product Master** ·
Price Lists *(future)* · Transporters *(future)* · Employees *(future)*.

## Product Families

Products are grouped into **families**, not treated as isolated SKUs:

```
Category            Loop
  └── Family        Loop · Cirro
        └── Variants
              4ft × 12m · Grey
              4ft × 12m · Red
              2ft × 12m · Grey
```

- **Family** = Category + Model (or Height for Artificial Grass).
- **Variant** = the distinguishing Backing/Type/Width/Length/Size/Colour.
- Families are a first-class axis for the list filter, management and reporting.

## Status lifecycle

Four states (replacing Active/Inactive):

| Status | Meaning |
|---|---|
| **Draft** | Being defined; not yet usable by other modules. SKU still editable. |
| **Active** | Live and sellable/usable across the ERP. SKU locked. |
| **Discontinued** | No longer offered for new documents; retained & resolvable. |
| **Archived** | Hidden from normal views; kept for history. |

Transitions and performers are documented in
[`../backend/state-machine.md`](../backend/state-machine.md).

## SKU rules

- **Auto-generated** from attributes, deterministic and unique
  (e.g. `LP-CIRRO-SPK-061X12-GRY`).
- **Editable only until first use.** Once the product is referenced by any Sales
  Order, Inventory Transaction or Production Record it is **locked forever**
  (`skuLocked`). Present-day proxy until those modules integrate: SKU locks when
  the product leaves **Draft** into the live catalogue.
- Never allow accidental SKU changes after a product enters the ERP.

## Module surfaces

### 1 · Dashboard — catalogue completeness
Total Products · Active · Draft · Discontinued · Categories · Recently Added ·
**Missing Images** · **Missing BOM** · **Missing Pricing**. Gives users visibility
into how complete the catalogue is.

### 2 · Product List
**Columns:** Image · SKU · Product Name · Category · Model · Variant · Status ·
Default Price · Weight · Unit · Last Updated.
**Filters:** Category · Model · Product Family · Width · Length · Colour · Status ·
Missing Image · Missing BOM · Missing Price.
**Actions:** Edit · Duplicate · Archive · Activate · Export · Bulk Update ·
Print Product Labels *(future)*.

### 3 · Product Details (tabbed)
A tabbed layout so future features slot in without redesign:

| Tab | Now |
|---|---|
| **General** | Primary image, Category, Product Family, Model, Variant, Product Name, SKU (auto, locks on use), Status |
| **Specifications** | Category-specific attributes (see below) + Unit, Weight, Sq Ft |
| **Pricing** | Default Selling Price (via **price group** — shared by a base's variants), HSN, GST · *Default Cost — future.* Tiered pricing (Dealer/Distributor/Customer/Qty-break/Export) lives in the future **Price List** module, not here (ADR-0006) |
| **Images** | Multiple images: Primary · Catalogue · Technical Drawing · Installation; drag & drop, reorder · *360° — future* |
| **Documents** | Product Catalogue PDF · Technical Data Sheet · Installation Guide · QC Sheet |
| **BOM** | Raw Materials · Qty · Unit · Scrap % · Production Line · Machine · Cycle Time · Packing Material *(structure only — no production logic)* |
| **Manufacturing** | Production Line · Machine · QC Template · Packing Type · Default Warehouse · Reorder Level · Min Stock · Max Stock |
| **Relationships** | Compatible · Accessories · Replacement · Upgraded Version · Discontinued By |
| **Inventory** | Placeholder — filled when Inventory lands |
| **Sales History** | Placeholder — filled when Sales/Reporting lands |
| **Purchase History** | Placeholder — filled when Purchase lands |
| **Audit Log** | Created By/On, Updated By/On · *full change history — future* |
| **Analytics** | Read-only placeholder cards → per-product dashboard (below) |

### Category-specific attributes (Specifications)

| Category | Attributes |
|---|---|
| Loop | Backing · Width · Length · Colour |
| Tefno / Turf / Wire Mat | Width · Length · Colour |
| Artificial Grass | Height · Type (SL/DL) · Width · Length · Colour |
| Mono Grass | Backing · Width · Length · Colour |
| Footmat | Size · Backing · Colour |

(The Model/Height sits on the family; the variant carries the rest.)

### Analytics tab (read-only, placeholder now)
Designed to eventually show, per product: Sales quantity (30/90/365d), Revenue,
Gross margin, Current stock, Orders in progress, Production frequency, Top
customers, Last manufactured date, Last sold date, Last purchased raw materials,
Product profitability. When reporting is built, **every product becomes its own
dashboard**.

## Data model (V2)

**Identity & lifecycle:** `id`, `sku`, `skuLocked`, `status`, `name`, `family`,
`category`.
**Specifications:** category-specific attributes + `unit`, `weight`, `sqft`.
**Commercial:** `priceGroup` (→ Default Selling Price stored **once per
colour-independent base**, inherited by variants — no duplicated pricing),
`hsn`, `gst` (defaults: Artificial Grass **5%**, others **18%**) (+ Default Cost
future). Freight/Landed and tiered pricing are **not** here — see ADR-0006.
**Rich containers:** `images[]` (`{url,type,primary,order}`), `documents[]`
(`{name,type,url}`), `bom` (`{materials[],productionLine,machine,cycleTime,packing}`),
`manufacturing` (`{line,machine,qcTemplate,packingType,warehouse,reorder,minStock,maxStock}`),
`relationships` (`{compatible[],accessories[],replacement[],upgradedBy[],discontinuedBy[]}`).
**Audit:** `createdBy`, `createdOn`, `updatedBy`, `updatedOn`.

Seed: `public/data/products.json` (532 products, 7 categories). Edits/additions
persist to a browser-local overlay (`atlas-products-overlay`) over the static seed;
rich containers default empty and are stored only when set — the same pattern as
orders, until the backend Product Master lands.

## Permissions

| Action | Catalogue/Admin | Other roles |
|---|---|---|
| Create / edit / duplicate | ✅ | ❌ |
| Change status (activate / discontinue / archive) | ✅ | ❌ |
| Edit SKU (Draft only, pre-use) | ✅ | ❌ |
| Read / select / report | ✅ | ✅ (read-only) |

## Business Rules

1. **Single source of truth** — products exist only here; others reference by
   Product ID / SKU (Principle #5). No module hardcodes product attributes.
2. **Category-specific attributes** — only applicable fields per category.
3. **Deterministic, unique SKU**, locked once the product is used (or leaves Draft).
4. **Lifecycle, not deletion** — Discontinue/Archive; never hard-delete referenced
   products.
5. **Families group variants** — Category + Model defines a family.
6. **Structure before logic** — BOM/Manufacturing/Relationships store data now;
   Production/Inventory logic comes later and consumes it.
7. **Audit everything** — created/updated by & on recorded on every change.

## Notifications

- Dashboard surfaces catalogue gaps (missing images / BOM / pricing) and recently
  added products.
- (Future) alerts for incomplete required fields, duplicate variant combinations.

## Future Roadmap

- **Create Sales Order integration** — SO product pickers generated from Product
  Master; then Inventory (stock by SKU), Dispatch/Warehouse (pick by SKU),
  Production (BOM by SKU), Purchase (raw materials).
- **Import / Export** and **Print Product Labels**.
- **AI background removal**, 360° views, richer pricing (price lists per party/tier).
- **Full change history**, per-product analytics wired to real reporting.
- **Backend Product Master** on PostgreSQL/Prisma
  ([`../backend/database-design.md`](../backend/database-design.md)).
