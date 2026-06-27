# Document Lifecycle

| | |
|---|---|
| **Version** | 0.1 |
| **Status** | 📝 Draft |
| **Last Updated** | 27 Jun 2026 |
| **Related ADRs** | ADR-0001, ADR-0002 |
| **Related Modules** | Sales · Dispatch · Warehouse · Accounts |

> The document chain that carries a transaction from offer to settlement. Each
> stage creates a **new document linked to the previous one** — never an
> overwrite (Principle #2). For every document: creator, owner, whether it's
> editable, when it becomes immutable, and what it produces next.

---

## The chain

```
Quotation        (editable offer)
   │ convert
   ▼
PI / Sales Order (confirm → immutable)
   │ ready for dispatch → hand to Dispatch
   ▼
Dispatch Record  (append-only, 1..n per order)
   │ goods leave → verify
   ▼
Packing Slip     (quantity verification, lock on verify)
   │ verified → enables billing
   ▼
Invoice          (financial verification, lock on verify)
   │ verified → awaiting settlement
   ▼
Payment          (append-only receipts)
```

> **Note on PI vs. Sales Order.** Conceptually the **PI is the confirmed Sales
> Order** — the same business document, identified by its PI number. The
> `Quotation` is a *separate, earlier* editable document that converts into it.
> The current app treats the PI/Sales Order as one entity; the backend keeps the
> Quotation distinct so pre-order negotiation never mutates the immutable order.

---

## Per-document definition

### Quotation
- **Creator:** Sales.
- **Owner:** Sales.
- **Editable?** **Yes** — lines, pricing and terms change freely while negotiating.
- **Immutable?** Becomes **read-only on conversion** to a PI (kept for provenance).
- **Next document:** PI / Sales Order (on accept/convert).

### PI / Sales Order
- **Creator:** Sales (from a Quotation, or directly).
- **Owner:** Sales.
- **Editable?** Only while `Draft`. **No after `Confirmed`** — ordered quantities,
  rates and lines are frozen.
- **Immutable?** **Yes** after confirmation; the authoritative request everything
  reconciles to.
- **Next document:** Dispatch Record(s) — after Sales marks it *Ready for
  Dispatch* and ownership transfers to Dispatch.

### Dispatch Record
- **Creator:** Dispatch.
- **Owner:** Dispatch.
- **Editable?** **No** — append-only. A correction is a new record (or the
  packing-slip verified figures), never an edit.
- **Immutable?** **Yes** once recorded.
- **Next document:** Packing Slip (verifies the shipped goods). Many dispatch
  records may exist per order (partial dispatch).

### Packing Slip
- **Creator:** Dispatch (uploads the slip; confirms quantities).
- **Owner:** Dispatch.
- **Editable?** Editable **only during verification**; **locked on `Verified`**.
- **Immutable?** **Yes** once verified (re-verification is a new verified state;
  history retained).
- **Next document:** Invoice — verification **unlocks** billing; any variance
  notifies Sales to review first.

### Invoice
- **Creator:** Accounts.
- **Owner:** Accounts.
- **Editable?** Editable **only during reconciliation**; **locked on `Verified`**.
  Cannot start until the Packing Slip is verified.
- **Immutable?** **Yes** once verified.
- **Next document:** Payment (settlement).

### Payment
- **Creator:** Accounts.
- **Owner:** Accounts.
- **Editable?** **No** — append-only receipts; an over/short is a new
  payment/allocation, not an edit.
- **Immutable?** **Yes** once recorded.
- **Next document:** — (settles one or more Invoices via Payment Allocation;
  feeds receivables).

---

## Summary table

| Document | Creator | Owner | Editable | Becomes immutable | Produces |
|---|---|---|---|---|---|
| Quotation | Sales | Sales | Yes (until convert) | On conversion | PI / Sales Order |
| PI / Sales Order | Sales | Sales | Only while Draft | On `Confirmed` | Dispatch Record(s) |
| Dispatch Record | Dispatch | Dispatch | No (append-only) | On record | Packing Slip |
| Packing Slip | Dispatch | Dispatch | During verification | On `Verified` | Invoice |
| Invoice | Accounts | Accounts | During reconciliation | On `Verified` | Payment |
| Payment | Accounts | Accounts | No (append-only) | On record | — (settles invoices) |

## Rules across the chain

1. **Linkage, not mutation.** Each document references its predecessor
   (`quotationId` → `salesOrderId` → `dispatchId` → `packingSlipId` →
   `invoiceId`); none overwrites an earlier one.
2. **Anchor to original intent.** Every downstream line references the immutable
   **Sales Order Item**, so variance (quantity or money) is always vs. the request.
3. **Ownership transfers with the workflow.** Creating the next document is how an
   order moves between departments — Sales → Dispatch → Accounts.
4. **Lock on verification.** Packing Slip and Invoice are editable only while being
   reconciled, then locked; corrections after that are new linked records.
5. **Quantities vs. money.** Packing Slip verifies quantities; Invoice verifies
   money. Neither substitutes for the other (ADR-0002).
