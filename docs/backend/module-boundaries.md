# Module Boundaries

| | |
|---|---|
| **Version** | 0.1 |
| **Status** | 📝 Draft |
| **Last Updated** | 27 Jun 2026 |
| **Related ADRs** | ADR-0001, ADR-0002, ADR-0003 |
| **Related Modules** | All |

> Ownership between modules. Each module **owns** (is the only writer of) a set of
> entities, and **reads** others. This is what keeps business logic in one place
> and stops documents being rewritten across departments (Principles #1, #7). In
> NestJS each module is a code module; cross-module interaction is via read-only
> queries or domain events — never by writing another module's tables.

---

## Ownership matrix

| Module | Owns (writes) | Reads (no write) |
|---|---|---|
| **Sales** | Quotation, Sales Order (PI) + items, the *Ready-for-Dispatch* handover | Party, Product Variant, Dispatch/PackingSlip status (to show progress), Invoice/Payment status, variance flags |
| **Dispatch** | Dispatch records + items, Packing Slip + items, Transporter | Sales Order + items (read-only), Party, Product Variant, Warehouse pick/pack confirmations |
| **Warehouse** | Pick/Pack tasks + confirmed picked/packed quantities, Load Sheet generation | Sales Order + items, Dispatch (what to ship), Inventory stock (when available) |
| **Accounts** | Invoice + items, Payment, Payment Allocation | Sales Order + items, Packing Slip (verified quantities → what to bill), Party receivables |
| **Products / Catalogue** | Product, Model/Backing/Colour, Product Variant, SKU | — |
| **Inventory** *(planned)* | Stock-on-hand, stock movements, reservations | Product Variant, Dispatch (depletion), Warehouse (picks) |
| **CRM** *(planned)* | Party profile, communications, customer intelligence | Sales Orders, Invoices, Payments (for history/insight) |
| **Platform** | User, Role, Attachment, Audit, Outbox/Events, Notifications | All (cross-cutting services) |

---

## Module charters

### Sales
**Owns:** Quotations · PI / Sales Orders (+ items) · customer-facing order
communication · the dispatch handover (payment status, transporter choice,
packing type, CC, samples, remarks).
**Reads:** downstream status (dispatch progress, packing-slip variance, invoice,
payment) to display the order's journey — but never edits those documents.
**Key rule:** the Sales Order is immutable after confirmation; Sales reacts to
variance (review/acknowledge) rather than changing the order to match reality.

### Dispatch
**Owns:** Dispatch Records (+ items, incl. substitutions) · LR/docket, vehicle,
driver · Transporter list · Packing Slip verification (the single quantity
reconciliation).
**Reads:** the Sales Order + items (the request), Warehouse pick/pack
confirmations, Party.
**Key rule:** never mutates the Sales Order; ships what is loaded (append-only)
and verifies quantities against the order.

### Warehouse
**Owns:** Pick and Pack tasks · confirmed picked/packed quantities · Load Sheet
generation.
**Reads:** the Sales Order/Dispatch (what & how much to pick), packing
instructions (from Sales handover), Inventory stock (when available).
**Key rule:** confirms physical reality once; that confirmation feeds the
packing-slip step (minimise duplicate entry, Principle #9).

### Accounts
**Owns:** Invoices (+ items) · Payments · Payment Allocations · receivables
reconciliation.
**Reads:** the Sales Order + items (commercial intent) and the **verified Packing
Slip** (what actually shipped → what to bill). Never used to verify quantities.
**Key rule:** invoice reconciliation is the single financial verification; gated
on the packing slip being verified.

### Products / Catalogue
**Owns:** the product hierarchy and Variant/SKU generation; per-category unit
rules; valid attribute combinations.
**Reads:** —.
**Key rule:** the only source of variant identity; everyone else references SKUs.

### Inventory *(planned)*
**Owns:** stock-on-hand, movements and reservations per Variant.
**Reads:** Variant catalogue, Dispatch (depletion), Warehouse (picks).
**Key rule:** the **single source of truth for stock**; no other module keeps a
stock count (Principle #5).

### CRM *(planned)*
**Owns:** party profile, communications log, customer-intelligence signals.
**Reads:** orders, invoices, payments for history and insight.
**Key rule:** read-heavy; never edits financial or fulfilment documents.

### Platform (cross-cutting)
**Owns:** Users, Roles, Attachments, the Audit trail, the Outbox/Event bus,
Notifications — services every module uses.
**Reads:** everything as needed to provide cross-cutting capabilities.
**Key rule:** provides shared mechanisms (auth, audit, events) but holds **no
business rules** of its own.

---

## Shared domain services (owned by the business-logic layer, used by all)

These are **not** department modules but single implementations every module
calls, so logic isn't duplicated:

- **Variance engine** — one quantity-variance implementation (dispatch entry +
  packing slip). ADR-0002.
- **Status derivation** — order status from its document chain.
- **Product/Units** — hierarchy, SKU, unit rules.
- **Audit** — append-only history writing.
- **Notifications** — event → user/role alerts.

## Interaction rules

1. A module **writes only its own** entities.
2. To act on another module's data, **read it** (query) or **react to its events**
   (subscribe) — never write across the boundary.
3. Cross-module workflows advance by **ownership transfer** (status change), with
   each department appending its *own* document, not editing the upstream one.
4. Shared rules go in a **shared domain service**, never copied into a module.
