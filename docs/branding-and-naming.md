# Branding & Naming Conventions

| | |
|---|---|
| **Version** | 1.0 |
| **Status** | ✅ Convention (applies everywhere) |
| **Last Updated** | 10 Jul 2026 |
| **Related ADRs** | ADR-0001 |
| **Related Modules** | All |

> One name, used consistently. The **product** is **Native**; the **company** that
> builds it is **dotatlas**. "Atlas" on its own is not a name we use — not in the
> UI, not in documentation, not in code.

---

## The two names

| Concept | Name | Use it for |
|---|---|---|
| **Product** | **Native** | The application itself — the operating surface users log into. |
| **Company** | **dotatlas** | Who builds and owns Native. Appears in the footer and legal/company context. |

Say **"Native"** when you mean the app ("open Native", "Native computes the
variance"). Say **"dotatlas"** when you mean the company ("Built by dotatlas").
Never shorten the product to "Atlas".

## Reference table

| Where | Convention |
|---|---|
| **Company** | dotatlas |
| **Product** | Native |
| **Repository** | Native |
| **Internal namespace** (shared utilities/services) | `native` — e.g. `nativeResolveRate()`, `nativeResolvedPrice()`, `nativePriceResolver` |
| **Database prefix** (if ever used) | `native_` |
| **Browser-local storage keys** | `native-*` (e.g. `native-products-overlay`, `native-pricelists`) |
| **UI title** | Native |
| **UI wordmark** | Native |
| **Footer** | Built by dotatlas |
| **Documentation** | Refer to the application as **Native** |

## Code conventions

- **Shared utilities and services** use the `native` namespace, not `atlas`:
  `nativeResolveRate()`, `nativeResolvedPrice()`, `nativePriceResolver`, and so on.
- **Storage keys** are prefixed `native-`. A one-time migration shim copies any
  legacy `atlas-*` keys to their `native-*` equivalents on load, so existing
  browsers keep their data.
- **Log tags** read `[native]`, not `[atlas]`.
- **Database** — no table prefixes are used today; *if* prefixes are ever
  introduced, use `native_`.

## Exceptions (intentional)

These retain the string "atlas" on purpose and are **not** naming violations:

- **`dotatlas`** — the company name; the substring "atlas" is part of it.
- **`Comfort_atlas`** — the literal name of an external Google Sheet the app
  writes to; renaming the copy would misdescribe the actual sheet.
- **Legacy `atlas-*` storage keys** — read only by the migration shim, never
  written anew.

## Rule

Before adding a user-facing string, a shared utility, or a storage key, check it
against this table. New "Atlas" references (for the product) should not be
introduced.
