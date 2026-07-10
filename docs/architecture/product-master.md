# Architecture — Product Master

| | |
|---|---|
| **Version** | 3.0 |
| **Status** | ✅ Implemented (standalone; SO integration next phase) |
| **Last Updated** | 10 Jul 2026 |
| **Related ADRs** | ADR-0001, ADR-0004, ADR-0005, ADR-0006, ADR-0008, ADR-0009 |
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

## Parent product → colour variant (ADR-0009)

Colour is a **variant under a single parent product**, not a separate SKU and not
a throwaway display attribute — because **stock and production are managed by
colour**.

```
Parent product        LP-ALTO-DIA-061X15   "ALTO DIAMOND 2ft×15m"
  common data         dimensions · Sq.Ft. · weight · HSN · GST · specs · base rate
  └── Colour variants
        LP-ALTO-DIA-061X15-BEI   BEIGE   · own stock · production · availability
        LP-ALTO-DIA-061X15-BLK   BLACK   · own stock · production · availability
        …                        (price inherited from parent unless overridden)
```

- The **parent** owns everything common: name, category, model/height,
  backing/type, dimensions, Sq.Ft., weight, HSN, GST, specifications, images,
  documents, BOM, manufacturing, and the **base rate**. Its SKU is
  colour-independent.
- Each **variant** carries its own **SKU** (parent SKU + colour code), **stock,
  production planning and availability**, and an optional **rate override**;
  otherwise it inherits the parent's base rate.
- **Sales, Purchase and Production Orders reference the variant SKU.** Common
  info and pricing are read from the parent unless the variant overrides them.
- The catalogue holds **124 parents / 516 variants** (updated master spec),
  replacing the old flat 532 per-colour SKUs.

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

- **Auto-generated** from attributes, deterministic and unique. The **parent**
  SKU is colour-independent (e.g. `LP-CIRRO-SPK-061X12`); each **variant** SKU
  appends the colour code (e.g. `LP-CIRRO-SPK-061X12-GRY`).
- **Editable only until first use.** Once the product is referenced by any Sales
  Order, Inventory Transaction or Production Record it is **locked forever**
  (`skuLocked`). Present-day proxy until those modules integrate: SKU locks when
  the product leaves **Draft** into the live catalogue.
- Never allow accidental SKU changes after a product enters the ERP.

## Module surfaces

### 1 · Dashboard (landing) — the module opens on a dashboard, not a raw table
Product Master is a **module landing page**: KPIs, then attention panels, then the
catalogue.
- **KPIs:** Total · Active · Draft · Discontinued · Categories · Recently Added ·
  **Missing Images** · **Missing BOM** · **Missing Pricing** (each click-to-filter).
- **Attention panels** (each lists a few items and filters the catalogue on click):
  **Recently Added · Recently Updated · Low Stock · Missing Images · Missing BOM ·
  Needing Review** (Draft / low completeness).
- **Catalogue** table below.

### 2 · Product List (catalogue)
**Columns:** Thumbnail · Product Name (with SKU beneath) · Category · Model ·
**Backing · Size · Colours** (a swatch + count of colour variants) · **Stock** (snapshot
indicator 🟢/🟡/🔴) · **Completeness %** · Status · quick-action icons.
**Completeness** = share of {image, price, BOM, documents, specs} present; surfaces
which products need attention. **Stock** is a placeholder snapshot today, wired to
Inventory later.
**Quick actions (per row icons):** Edit · Duplicate · Images · Documents · BOM ·
Analytics — each opens the detail on that tab.
**Filters:** Category · Model · Product Family · Width · Length · Colour · Status ·
Missing Image · Missing BOM · Missing Price.
**Universal search** finds a product by *anything* — colour, model, width (e.g.
`4ft`), backing (`Spike`), SKU, HSN, product name, family.
**Bulk / catalogue actions:** Bulk status update · Export · Archive/Activate ·
Print Product Labels *(future)*.

### 3 · Product Details (tabbed)
A tabbed layout so future features slot in without redesign:

| Tab | Now |
|---|---|
| **General** | Primary image, Category, Product Family, Model, Product Name, SKU (auto, colour-independent, locks on use), Status |
| **Specifications** | Category-specific attributes (see below) + Unit, Weight, Sq Ft (shared by all colour variants) |
| **Variants** | **Colour variants** — colour, variant SKU (parent + colour), stock, availability, selling rate (inherited base rate or per-variant override). Add / remove variants. Stock/production/availability are placeholders until Inventory & Production land (ADR-0009) |
| **Pricing** | Default Selling Price (via **price group** — shared by a base's variants), HSN, GST · *Default Cost — future.* Tiered pricing (Dealer/Distributor/Customer/Qty-break/Export) lives in the future **Price List** module, not here (ADR-0006) |
| **Images** | Multiple images: Primary · Catalogue · Technical Drawing · Installation; drag & drop, reorder · *360° — future* |
| **Documents** | Product Catalogue PDF · Technical Data Sheet · Installation Guide · QC Sheet |
| **BOM** | Raw Materials · Qty · Unit · Scrap % · Production Line · Machine · Cycle Time · Packing Material *(structure only — no production logic)* |
| **Manufacturing** | Production Line · Machine · QC Template · Packing Type · Default Warehouse · Reorder Level · Min Stock · Max Stock |
| **Relationships** | Manual: Compatible · Accessories · Replacement · Upgraded Version · Discontinued By. **Auto-derived:** Same Model · Alternative Colours (computed from the catalogue) |
| **Inventory** | Placeholder — filled when Inventory lands |
| **Sales History** | Placeholder — filled when Sales/Reporting lands |
| **Purchase History** | Placeholder — filled when Purchase lands |
| **Audit Log** | Created By/On, Updated By/On + a **product timeline** (Created → Price changed → Image added → BOM updated → Used in SO → Last sold — placeholder milestones today) · *full change history — future* |
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

## Data model (V3 — parent/variant)

**Identity & lifecycle:** `id`, `sku` (colour-independent), `skuLocked`, `status`,
`name`, `family`, `category`.
**Specifications:** category-specific attributes + `unit`, `weight`, `sqft`.
**Colour variants:** `variants[]` — each `{ id, sku (parent + colour code),
colour, status, rateOverride, stock, availability }`. Variants carry their own
stock / production / availability and inherit the parent base rate unless
`rateOverride` is set. Sales / Purchase / Production Orders reference the variant
SKU (ADR-0009).
**Commercial:** `priceGroup` (→ **base rate** stored **once per parent**,
inherited by every colour variant — no duplicated pricing). The rate is per
**unit** — ₹/Sq.Ft. for rolls, ₹/Piece for footmats/car sets; per-roll/piece
totals are **computed** (rate × Sq.Ft.), never stored (ADR-0007). `hsn`, `gst`
(updated spec — **Artificial Grass & Mono Grass → HSN 57033100 / GST 5 %**; all
other categories → **HSN 39189090 / GST 18 %**) (+ Default Cost future).

> **Product Master is independent of Price Lists (ADR-0008).** It exposes the
> **base rate only** and never resolves or displays an *effective* price via any
> price list (including the System Default). Customer/market rates live in
> **Price Lists** ([price-lists.md](./price-lists.md)); price resolution happens
> only at **document creation** (party list → default list → base rate).
**Rich containers:** `images[]` (`{url,type,primary,order}`), `documents[]`
(`{name,type,url}`), `bom` (`{materials[],productionLine,machine,cycleTime,packing}`),
`manufacturing` (`{line,machine,qcTemplate,packingType,warehouse,reorder,minStock,maxStock}`),
`relationships` (`{compatible[],accessories[],replacement[],upgradedBy[],discontinuedBy[]}`).
**Audit:** `createdBy`, `createdOn`, `updatedBy`, `updatedOn`.

Seed: `public/data/products.json` (schemaVersion 3 — **124 parents / 516 colour
variants**, 7 categories; imported from the updated master spec). It also emits
`priceGroups` (parent base rate) and `priceListSeeds.bulk.overrides` (the spec's
Bulk column, used to seed the Bulk price list). Edits/additions persist to a
browser-local overlay (`native-products-overlay-v3`) over the static seed;
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
