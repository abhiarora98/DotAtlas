# 0008 — Product Master independent of Price Lists; resolve only at document creation

- **Status:** Accepted
- **Date:** 2026-07-10
- **Refines:** ADR-0007 (which briefly had Product Master resolve an effective rate
  via the default price list). That coupling is removed.

## Context

ADR-0007 let Product Master display an *effective* rate resolved through the
System Default Price List. That couples the catalogue to the commercial layer and
blurs the single-source-of-truth boundary: Product Master should describe the
product; Price Lists should decide what it sells for.

## Decision

1. **Product Master is completely independent of Price Lists.** It exposes the
   **Base Rate only** and never resolves or displays an effective price via any
   price list (including the System Default). Its Pricing tab reads/edits the base
   rate; completeness/computed figures use the base rate.

2. **Price resolution happens only during document creation** — Sales Orders,
   Quotations, Proforma Invoices, and any future pricing calculation. It is *not* a
   property of the product record.

3. **Resolution order** (applied by the document, not the product):
   ```
   1. Party's assigned Price List (override for the group)
   2. System Default Price List (is_default override for the group)
   3. Product Master Base Rate
   ```
   The effective price is then computed from the resolved rate (rate × Sq.Ft. for
   rolls, rate for pieces — ADR-0007).

4. **The resolver lives in the pricing layer** (Price Lists module), reading
   Product Master's base rate as a *consumer*. Product Master contains **no**
   reference to price lists.

## Consequences

- Product Master's `rateOf`/`priceOf` use the base rate only; the
  default-price-list lookup is removed from the catalogue module.
- A shared resolver (`atlasResolveRate(group, partyListId)` /
  `atlasResolvedPrice(product, partyListId)`) is exposed by the Price Lists module
  for document creation; today it has no consumer (Sales Orders not built) but is
  the single entry point when they are.
- Cleaner boundary for the upcoming Sales Order rebuild: `Party → assigned Price
  List → (default → base) → Sales Order line`, with the product record untouched.
