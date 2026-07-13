# Working agreement for this repo (Native / dotatlas ERP)

## Branch
- The live line is **`claude/gracious-volta-pjimes`** (the Vercel deployment). All work happens here.
- **Start every session by:** `git fetch` → `git checkout claude/gracious-volta-pjimes` → `git pull` → confirm the branch with `git branch --show-current` before doing anything else.
- Never push to a different branch without explicit permission.

## How to work
- **Incremental only. Never recreate or replace an existing feature unless explicitly asked.** Add on top; keep what works.
- Preserve all existing functionality with every change.
- **Before committing, verify these modules still render (no JS errors):** Sales Orders, Product Master, Receivables, Price Lists. A quick headless load of `public/index.html` and clicking each nav item is enough.

## Data
- App data lives in `public/data/` (`orders.json`, `products.json`, `receivables.json`, …). The pages fetch these at runtime.
- `receivables.json` schema: `{ generated, parties: { <slug>: { name, bf24, opening, billed, received, outstanding, fy25:[…], fy26:[…] } } }`, where each transaction is `{ d, t, v, dr, cr }`. FY26 dates are `"DD Mon"` (current FY, no year); FY25 dates carry the `"YY"` suffix.
- Updating receivables = append new vouchers to each party's `fy26`, recompute `billed`/`received`/`outstanding`, bump `generated`. Dedupe by voucher no.

## Current priority
- **Complete and stabilize the core ERP modules** (Orders, Receivables, Product Master, Price Lists, Dispatch, …). Build these out incrementally.
- The current data flow is fine as-is: uploading a new Tally Excel updates `receivables.json` and the receivables page. Keep this approach for now.

## Architecture direction (deferred — do NOT start unless explicitly asked)
- **Only after** the core ERP is feature-complete: move the UI toward **fully data-driven rendering** so the dashboard, party list, KPIs, chips, and filters build themselves in the browser from the data source (JSON now, Supabase later) — uploading a new file updates the UI automatically, with **no separate HTML-generation step**.
- First target when that time comes: the Receivables cockpit Level-1 (rows + hero/KPIs/concentration are currently generated as static HTML). The account-statement drawer already reads `receivables.json` at runtime — extend that pattern to the rest of the page. Until then, regenerate the static HTML when the data changes.
