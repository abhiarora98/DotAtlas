# Product Hierarchy

> **Last updated:** 2026-06-27
> **Scope:** Conceptual model of how DotAtlas products are described throughout
> Native. This governs how line items are displayed, grouped, and unit-counted.

## Principle: a hierarchy, never a flat name

A product is described by a set of **distinct, labelled attributes**, never a
single concatenated string. This keeps grouping, variance and reporting precise.

```
Product (Category)
   └── Model
         └── Backing
               └── Colour
                     └── Size  (Width × Length)
```

Example:

| Field | Value |
|---|---|
| Product | Turf |
| Model | Kappa Turf |
| Backing | Spike |
| Colour | P.Green |
| Size | 2ft × 12m |

### De-duplication rule

Any attribute whose value merely **repeats the product** is dropped from display
so the same word never appears twice (e.g. backing "Turf" under product "Turf" is
omitted; a model equal to the product is omitted). The Product is always shown
first as the lead of the hierarchy.

## Categories (Product)

The top of the hierarchy is the **Category**. Observed categories in the current
dataset (`public/data/orders.json`), by line-item frequency:

| Category | Approx. lines | Unit |
|---|---|---|
| Rolls | ~3,060 | rolls |
| S-Mat | ~1,630 | rolls |
| Foot Mat | ~800 | pcs |
| Turf | ~580 | rolls |
| Grass | ~445 | rolls |
| WIRE | ~250 | rolls |
| Car Set | ~130 | sets |
| Monograss | ~115 | rolls |
| Backing Sheet | ~4 | rolls |
| STRIPE | ~3 | rolls |
| Heavy | ~3 | rolls |

> Counts are indicative and will change as data grows; categories are the stable
> concept.

## Units (product-aware counting)

Quantities are counted in **category-appropriate units**, not a generic "units".
The rule:

- Category contains **"foot"** → **pcs** (Foot Mats are counted in pieces).
- Category contains **"set"** → **set / sets** (Car Sets are counted in sets).
- Everything else (Rolls, **S-Mat**, Turf, Grass, WIRE, Monograss, …) → **roll /
  rolls**.

Singular/plural is chosen by quantity (`1 roll`, `3 rolls`). When a mixed group
spans categories with different units, a neutral "units" label is used for the
shared total.

> **Note:** S-Mat is counted in **rolls**, not pieces — it matches "mat" but the
> unit rule keys on "foot"/"set" only, so S-Mat correctly resolves to rolls.

## Line-item fields

Each Sales Order Item carries, alongside the hierarchy:

| Field | Meaning |
|---|---|
| `qty` | Ordered quantity (immutable) |
| `units` | Underlying unit measure (e.g. running length) |
| `billRate` / `actualRate` | Commercial rates |
| `freight` | Freight component |
| `taxable` | Taxable value |
| `total` | Line total |
| `width`, `length` | Size dimensions |

## Grouping in the UI

Line items are grouped for dispatch, packing and reconciliation by:

```
Product → Model · Backing · Size → Colours (the variant rows)
```

This grouping is what the dispatch entry, packing-slip verification, dispatch
history and load sheet all share — each colour is a variant row under its
Product/Model/Backing/Size group, and variance is computed per colour.

## Special handling

- **Foot Mats & Car Sets** are not listed on our packing slips. During
  packing-slip verification their quantities are flagged `manual` and entered by
  hand (see [`../architecture/dispatch.md`](../architecture/dispatch.md)).
- **Substitutions** — when a different SKU ships in place of an ordered one, the
  substitute is recorded against the dispatch/packing-slip as an extra item, not
  by editing the ordered line.

## Future

- A real **Product catalogue** entity (today products are implied by line-item
  attributes) with valid Model/Backing/Colour/Size combinations, so orders and
  substitutions can be validated against a master list.
- Per-category unit definitions and conversions held as catalogue data rather
  than a code rule.
