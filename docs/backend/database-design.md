# Database Design (Logical)

| | |
|---|---|
| **Version** | 0.1 |
| **Status** | 📝 Draft |
| **Last Updated** | 27 Jun 2026 |
| **Related ADRs** | ADR-0001, ADR-0002, ADR-0003, ADR-0005 |
| **Related Modules** | All |

> Logical database design — **no SQL**. For each entity: why it exists, its
> primary key, foreign keys, ownership, and relationships. This is the contract
> the Prisma schema will satisfy; it refines [`../database/er-diagram.md`](../database/er-diagram.md)
> with keys and ownership.

**Conventions**
- Every entity has a surrogate **PK `id`** (UUID) unless noted. Natural keys
  (SKU, PI number, invoice number) are **unique constraints**, not the PK, so
  references stay stable even if a human-facing number changes.
- **Ownership** = the single module allowed to *write* the entity. Others may
  *read* it (see [`module-boundaries.md`](./module-boundaries.md)).
- "Immutable after X" entities are append-only; corrections create new linked rows.

---

## Identity & catalogue

### Party
- **Why.** The customer/supplier we trade with; anchor for orders, billing and
  receivables. Without it there is no counterparty for any document.
- **PK.** `id`. **Unique.** `code` (party code).
- **FK.** `priceListId` → PriceList (assigned pricing; drives Sales Order rates,
  ADR-0007).
- **Owner.** Sales / CRM.

### User
- **Why.** An authenticated actor with a role; powers authz and the audit trail
  ("by whom"). Every state change references one.
- **PK.** `id`. **Unique.** `email`.
- **FK.** `roleId` → Role.
- **Owner.** Platform.

### Role
- **Why.** Names a permission set (Sales, Dispatch, Warehouse, Accounts,
  Management, Admin). Keeps permissions out of code branches.
- **PK.** `id`. **Unique.** `name`.
- **FK.** —. **Owner.** Platform.

### ProductFamily
- **Why.** Groups variants of one design (Category + Model, e.g. `Loop · Cirro`)
  so the catalogue is managed by family rather than thousands of isolated SKUs
  (ADR-0005). Carries family-level defaults (category, model/height).
- **PK.** `id`. **Unique.** `(category, model)`.
- **FK.** —. **Owner.** Product Master.

### ProductVariant (Product)  *(catalogue leaf)*
- **Why.** The atomic sellable/stockable unit identified by a stable **SKU**, with
  a lifecycle (`Draft → Active → Discontinued → Archived`). Everything operational
  keys on it. See [`../database/product-hierarchy.md`](../database/product-hierarchy.md).
- **PK.** `id`. **Unique.** `sku`.
- **Fields.** `status`, `skuLocked` (SKU immutable once used), `name`, unit/weight/
  sqft, commercial (sellingPrice, hsn, gst, freight; purchasePrice, landedCost
  future), category-specific attributes (backing/height/type/width/length/size/
  colour), audit (`createdBy/On`, `updatedBy/On`).
- **FK.** `familyId` → ProductFamily; optional `modelId`, `backingId`, `colourId`
  if attributes are normalised into lookup tables (Phase 2).
- **Owner.** Product Master.

### ProductImage
- **Why.** A product may have several typed images (Primary, Catalogue, Technical
  Drawing, Installation), ordered, one primary. Binary in object storage; row holds
  metadata + key.
- **PK.** `id`. **FK.** `productId` → ProductVariant; `attachmentId` → Attachment.
  Fields: `type`, `isPrimary`, `sortOrder`. **Owner.** Product Master.

### ProductDocument
- **Why.** Typed attachments — Product Catalogue PDF, Technical Data Sheet,
  Installation Guide, QC Sheet.
- **PK.** `id`. **FK.** `productId` → ProductVariant; `attachmentId` → Attachment.
  Field: `type`. **Owner.** Product Master.

### ProductBom (+ BomLine)  *(structure only — no production logic yet)*
- **Why.** Captures how a product is made so Production/Costing can consume it later:
  raw materials, quantity, unit, scrap %, plus production line, machine, cycle time,
  packing material.
- **PK.** `id`. **FK.** `productId` → ProductVariant. `BomLine`: `bomId` → ProductBom,
  `rawMaterialId` → ProductVariant/Material, qty, unit, scrapPct. **Owner.** Product
  Master (Production reads later).

### PriceGroup  *(ADR-0006, ADR-0007)*
- **Why.** Holds the **default rate once per colour-independent base**
  (`Category|Model/Height|Backing|Type|Width|Length|Size`) so variants inherit it
  and identical prices are never duplicated across colours. The rate is per **unit**
  — ₹/Sq.Ft. for rolls, ₹/Piece for footmats/car sets; per-roll/piece totals are
  **computed** (rate × Sq.Ft.), never stored (ADR-0007).
- **PK.** `id`. **Unique.** the base key. Fields: `rate`, `unit` (`sqft`|`piece`),
  `cost` (future).
- **FK.** ProductVariant references `priceGroupId`. **Owner.** Product Master
  (the default); Price Lists override on top.

### PriceList  *(ADR-0007)*
- **Why.** A named set of selling-rate overrides for a customer segment/market
  (Default, Dealer, Distributor, Institutional, Export, Government, + custom). The
  commercial layer that varies by customer — distinct from product identity/tax.
- **PK.** `id`. **Unique.** `name`. Fields: `description`, `status`, `system`,
  audit, `currency`/`effectiveDate` (future).
- **FK.** — (assigned parties via `Party.priceListId`). **Owner.** Price Lists.

### PriceListItem  *(override)*
- **Why.** One **rate override** in a list for a price group — stored *only* where
  it differs from the default (override-only; no catalogue duplication). Effective
  rate = `PriceListItem.rate ?? PriceGroup.rate`; effective price computed from it.
- **PK.** `id`. **Unique.** `(priceListId, priceGroupId)`. Field: `rate`.
- **FK.** `priceListId` → PriceList; `priceGroupId` → PriceGroup. **Owner.** Price
  Lists.

### ProductManufacturing
- **Why.** Manufacturing/stock defaults future modules consume: production line,
  machine, QC template, packing type, default warehouse, reorder level, min/max
  stock.
- **PK.** `id`. **FK.** `productId` → ProductVariant (1‑to‑1). **Owner.** Product
  Master (Inventory/Production read later).

### ProductRelationship
- **Why.** Relates products: compatible, accessories, replacement, upgraded-by,
  discontinued-by — powering cross-sell, substitution and lifecycle chains.
- **PK.** `id`. **Unique.** `(productId, relatedProductId, type)`.
- **FK.** `productId` / `relatedProductId` → ProductVariant. **Owner.** Product Master.

### Product attribute lookups *(Model, Backing, Colour — Phase 2)*
- **Why.** Normalised catalogue values that constrain valid variants and carry
  per-category unit rules. Today attributes are stored as fields; lookups make
  combinations validatable later.
- **PK.** `id` each. **Unique.** `name` (scoped). **Owner.** Product Master.

---

## Sales chain

### Quotation  *(editable draft)*
- **Why.** A pre-order, negotiable offer to a party before commitment. Exists so
  pricing/lines can change freely *before* the immutable order is created.
- **PK.** `id`. **Unique.** `quotationNo`.
- **FK.** `partyId` → Party; `salespersonId` → User.
- **Owner.** Sales. **Editable:** yes (until converted).

### QuotationItem
- **Why.** A negotiable line on a quotation.
- **PK.** `id`. **FK.** `quotationId` → Quotation; `variantId` → ProductVariant.
- **Owner.** Sales (child of Quotation).

### SalesOrder (PI)  *(immutable after confirmation)*
- **Why.** The authoritative statement of what the customer requested; the
  reference everything downstream reconciles to. The PI number is its
  customer-facing identity.
- **PK.** `id`. **Unique.** `piNumber`.
- **FK.** `partyId` → Party; `salespersonId` → User; nullable `quotationId` →
  Quotation (provenance). Handover fields (`transporterId`, payment status,
  packing) captured at *Ready for Dispatch*.
- **Owner.** Sales. **Editable:** no after `Confirmed`. **Status:** derived.

### SalesOrderItem  *(immutable)*
- **Why.** One ordered line: variant + ordered quantity + commercials (bill/actual
  rate, freight, taxable, total). The immutable reference every downstream line
  points back to, so variance is always measured against original intent.
- **PK.** `id`. **FK.** `salesOrderId` → SalesOrder; `variantId` → ProductVariant.
- **Owner.** Sales (child of SalesOrder).

---

## Dispatch chain

### Dispatch  *(append-only)*
- **Why.** A single physical shipment of an order (one of possibly many, enabling
  partial dispatch) — what actually left, with carrier/LR detail.
- **PK.** `id`. **Unique.** `(salesOrderId, sequence)`.
- **FK.** `salesOrderId` → SalesOrder; `transporterId` → Transporter; `recordedById`
  → User.
- **Owner.** Dispatch. **Editable:** no (append-only).

### DispatchItem
- **Why.** What was loaded for one order line in one shipment (raw/uncapped qty),
  or a substitution (a different variant shipped instead). Captures reality, never
  edits the order.
- **PK.** `id`. **FK.** `dispatchId` → Dispatch; `salesOrderItemId` →
  SalesOrderItem; nullable `substituteVariantId` → ProductVariant.
- **Owner.** Dispatch (child of Dispatch).

### PackingSlip  *(quantity verification)*
- **Why.** The verified record of what physically left, reconciled PI ↔ slip.
  Separate document so requested vs. shipped stays distinct and disputes are
  resolvable. Holds the uploaded document reference, verified totals and the
  classified variance snapshot.
- **PK.** `id`. **FK.** `salesOrderId` → SalesOrder; `dispatchId` → Dispatch
  (the shipment it verifies); `attachmentId` → Attachment; `verifiedById` → User.
- **Owner.** Dispatch. **Editable:** locked once `Verified`.

### PackingSlipItem
- **Why.** The verified quantity per order line (incl. manual Foot Mat / Car Set
  entries and substitutions). The authoritative "what shipped" used downstream.
- **PK.** `id`. **FK.** `packingSlipId` → PackingSlip; `salesOrderItemId` →
  SalesOrderItem; nullable `substituteVariantId` → ProductVariant.
- **Owner.** Dispatch (child of PackingSlip).

### Transporter
- **Why.** A reusable carrier captured once at handover; avoids re-entry and
  enables transporter-level reporting.
- **PK.** `id`. **Unique.** `name`. **FK.** —. **Owner.** Dispatch.

---

## Billing chain

### Invoice  *(financial verification)*
- **Why.** The sales invoice raised by Accounts, reconciled PI ↔ invoice (totals,
  rates, taxable, amount variance). Separate from the order so *requested* and
  *billed* never overwrite each other. Based on what was actually dispatched.
- **PK.** `id`. **Unique.** `invoiceNumber`.
- **FK.** `salesOrderId` → SalesOrder; `partyId` → Party; `attachmentId` →
  Attachment; `verifiedById` → User.
- **Owner.** Accounts. **Editable:** locked once `Verified`. Gated on PackingSlip
  verified.

### InvoiceItem
- **Why.** One billed line — rate & amount — compared to its PI line for variance.
- **PK.** `id`. **FK.** `invoiceId` → Invoice; `salesOrderItemId` → SalesOrderItem.
- **Owner.** Accounts (child of Invoice).

### Payment
- **Why.** A receipt from a party; drives receivables. Separate from invoice so one
  payment can settle several invoices and partial payments are first-class.
- **PK.** `id`. **FK.** `partyId` → Party; `recordedById` → User.
- **Owner.** Accounts.

### PaymentAllocation  *(link)*
- **Why.** Resolves the **many-to-many** between Payments and Invoices (a payment
  may cover multiple invoices; an invoice may be settled by several payments).
- **PK.** `id`. **Unique.** `(paymentId, invoiceId)`.
- **FK.** `paymentId` → Payment; `invoiceId` → Invoice.
- **Owner.** Accounts.

---

## Platform & cross-cutting

### Attachment
- **Why.** Metadata + storage key for an uploaded document (packing slip, invoice,
  future POD). The binary lives in object storage; the DB never holds it.
- **PK.** `id`. **FK.** `uploadedById` → User. Referenced by PackingSlip / Invoice.
- **Owner.** Platform (used by Dispatch/Accounts).

### AuditEvent
- **Why.** The append-only audit trail — what changed, when, by whom — for every
  state change (Principle #4). Backs the workflow timeline.
- **PK.** `id`. **FK.** `actorId` → User; polymorphic `subjectType` + `subjectId`
  (e.g. SalesOrder, Dispatch).
- **Owner.** Platform (written by every module via the Audit service).

### OutboxEvent
- **Why.** Reliable event publishing — domain events are written **in the same
  transaction** as the state change, then drained to consumers. Guarantees no
  lost/duplicated events. Feeds [`event-system.md`](./event-system.md).
- **PK.** `id`. **FK.** optional `subjectType` + `subjectId`. Has `type`,
  `payload`, `publishedAt`.
- **Owner.** Platform.

### Notification
- **Why.** A user/role-facing alert derived from an event (e.g. packing-slip
  variance to Sales). Separated from events so delivery/read-state is tracked.
- **PK.** `id`. **FK.** `recipientUserId`/`recipientRoleId`; source `outboxEventId`.
- **Owner.** Platform.

---

## Key relationship summary

| Parent | Child (1‑to‑many) | Cardinality note |
|---|---|---|
| SalesOrder | SalesOrderItem | items per order |
| SalesOrder | Dispatch | **1..n** (partial dispatch) |
| Dispatch | DispatchItem | items per shipment |
| Dispatch | PackingSlip | **0..1** (verified once) |
| PackingSlip | PackingSlipItem | verified lines |
| SalesOrder | Invoice | **0..n** |
| Invoice | InvoiceItem | billed lines |
| Invoice ⇄ Payment | PaymentAllocation | **many‑to‑many** |
| ProductVariant | SalesOrderItem / DispatchItem / PackingSlipItem | referenced by all line types |
| SalesOrderItem | DispatchItem / PackingSlipItem / InvoiceItem | the immutable back-reference |

### Ownership at a glance
Sales → Quotation, SalesOrder(+items). Dispatch → Dispatch(+items), PackingSlip
(+items), Transporter. Accounts → Invoice(+items), Payment, PaymentAllocation.
Products → Variant + catalogue. Platform → User, Role, Attachment, AuditEvent,
OutboxEvent, Notification.

### Invariants enforced at the data layer
- FKs back to **SalesOrderItem** on every downstream line keep variance anchored to
  original intent.
- Append-only entities (Dispatch, AuditEvent, OutboxEvent, Payment) are never
  updated in place.
- Derived values (fulfilment, status, variance totals) are **not stored** as
  authoritative columns; they are computed from the chain (cached read-models are
  allowed but never the source of truth).
