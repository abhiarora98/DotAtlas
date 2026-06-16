# atlas — Vercel serverless backend

Replaces the Apps Script web app. Faster, more robust, lives in this
repo. Same payload shape so the frontend doesn't change much.

## Setup (one-time, ~15 minutes)

### 1. Create a Google Cloud project + service account

A service account is a robot Google account that owns no data of its
own but can be granted access to specific files (like your sheet).

1. Open https://console.cloud.google.com.
2. Top bar → project dropdown → **New Project**.
   - Name: `atlas-dashboard` (or anything).
   - Click **Create**.
3. Wait ~30 sec; select the new project.
4. Left menu → **APIs & Services → Library**. Search **Google Sheets API**
   → click → **Enable**.
5. Left menu → **APIs & Services → Credentials**. Click **+ Create
   credentials → Service account**.
6. Name: `atlas-sheets-writer`. Skip the optional grant steps (Continue
   → Done).
7. Click the new service account in the list → **Keys** tab → **Add key
   → Create new key → JSON**. A `.json` file downloads. **Keep it
   safe** — anyone with this file can read/write any sheet shared with
   the service account's email.

### 2. Share the sheet with the service account

1. Open the JSON file you downloaded. Find the `"client_email"` field
   (looks like `atlas-sheets-writer@atlas-dashboard.iam.gserviceaccount.com`).
2. Open your **Comfort_atlas** Google Sheet.
3. Click **Share** (top-right) → paste the client_email → role **Editor**
   → uncheck "Notify people" → **Share**.

### 3. Get the Spreadsheet ID

From the sheet's URL: `https://docs.google.com/spreadsheets/d/<THIS_IS_THE_ID>/edit#gid=...`.
Copy the long string between `/d/` and `/edit`.

### 4. Add the env vars to Vercel

1. https://vercel.com → your `dotatlas` project → **Settings → Environment
   Variables**.
2. Add two variables (all three environments: Production, Preview, Development):

   | Name                     | Value |
   | ------------------------ | ----- |
   | `SHEETS_SPREADSHEET_ID`  | the long ID from step 3 |
   | `GOOGLE_SERVICE_ACCOUNT` | paste the **entire contents** of the JSON file from step 1 |

   For `GOOGLE_SERVICE_ACCOUNT`, paste the JSON file's contents as-is.
   Vercel's env-var input handles multiline values fine. The code also
   supports base64-encoded JSON if you'd rather:
   `cat key.json | base64 | pbcopy` then paste the base64 string.

3. Click **Save**.

### 5. Redeploy

Either push a new commit, or:
- Vercel project → **Deployments** → latest deployment → "..." menu →
  **Redeploy** → check **Use existing Build Cache** **OFF** → Deploy.

### 6. Test

Hit your live `/api/pi` endpoint in a browser to verify it's alive:

```
https://<your-vercel>.vercel.app/api/pi
```

You should see:

```json
{"ok":true,"app":"atlas","backend":"sheets-api","piSheet":"Comfort_atlas","partiesSheet":"Parties","time":"..."}
```

Then submit a test PI from the dashboard — should land in the sheet
in ~300ms.

## Endpoints

- **`GET /api/pi`** → health check. Returns the JSON above.
- **`POST /api/pi`** with body `{ kind: 'pi', header, rows }` → appends
  N rows to the `Comfort_atlas` tab.
- **`POST /api/pi`** with body `{ kind: 'party', party }` → appends one
  row to the `Parties` tab (auto-created on first call). The `party`
  object accepts `name`, `poc`, `state`, `gst`, `aadhaar`, `phone`,
  `city`, `type` (Customer/Supplier/Both), `status` (Active/Inactive).
  One of `gst` / `aadhaar` is required (Aadhaar must be 12 digits);
  `phone` must be a valid 10-digit Indian mobile. The **Party Code** is
  system-generated, unique and read-only — `[Name initials]-[State
  code][POC initials][3-digit running number]` (e.g. `AF-HRVS001` for
  "Abhitex Furnishings") — and returned as `code` in the response.
  Also accepts `email`, `billingAddress`, `shippingAddress`,
  `creditLimit`. Parties columns: `CreatedAt · Party Name · Party Code ·
  Sales POC · GSTIN · Aadhaar · State · Phone · City · Type · Status ·
  Email · Billing Address · Shipping Address · Credit Limit · UpdatedAt ·
  Stage · Owner` (Stage ∈ Lead/Qualified/Active/VIP/Dormant/Lost; Owner =
  assigned salesperson — both editable from the profile Settings tab).
- **`POST /api/pi`** with body `{ kind: 'listParties' }` → returns
  `{ ok, count, parties: [...] }`, every row of the `Parties` tab as
  objects. Powers the live All Parties list + search/filters in the UI.
- **`POST /api/pi`** with body `{ kind: 'updateParty', party }` → finds
  the row by `party.code` and updates the editable fields in place,
  preserving `CreatedAt` and the (read-only) code and stamping
  `UpdatedAt`. Returns `{ ok, code, record }`. Powers the Party Details
  drawer's Edit action, and Archive/Restore (which just set
  `status` to `Archived` / `Active`). Parties are never hard-deleted —
  archiving hides them from active lists while preserving all history.
- **CRM entities** (tasks, contacts, documents, interaction log / notes)
  live in a `PartyCRM` tab — one row per entity — so they sync across
  users and devices. Columns: `Id · PartyCode · Kind · Text · Due · Done
  · Meta(JSON) · CreatedAt · UpdatedAt`. Endpoints (all `POST /api/pi`):
  - `{ kind: 'crmList', partyCode }` → `{ ok, items }` for that party.
  - `{ kind: 'crmAdd', partyCode, entity: { kind, text, due, done, meta } }`
    → `{ ok, item }` (kind ∈ task | contact | document | log).
  - `{ kind: 'crmUpdate', id, patch: { text?, due?, done? } }` → `{ ok }`.
  - `{ kind: 'crmDelete', id }` → `{ ok }`.
  The Party Profile reads these on open (with a local cache for instant
  render + offline fallback) and merges notes/calls/WhatsApp/orders/
  payments/follow-ups into one chronological Timeline.
- **Sales documents** (Sales Orders + Sales Invoices) live in a
  `SalesDocs` tab — one row per document. Columns: `Id · DocType
  (SO/INV) · Number · Date · PartyCode · PartyName · POC · SourceRef ·
  Amount · Lines(JSON) · Status · DispatchStage · CreatedAt · UpdatedAt ·
  DispatchedAmount · InvoicedAmount`. The Sales Order is the operational
  source of truth: partial dispatch and partial invoicing are tracked by
  value (DispatchedAmount / InvoicedAmount), and invoices are generated
  from dispatched-but-not-yet-invoiced value. Order statuses: Draft,
  Awaiting Approval, Confirmed, Ready for Dispatch, Partially Dispatched,
  Completed, Cancelled.
  Endpoints (all `POST /api/pi`): `{ kind: 'salesDocList' }`,
  `{ kind: 'salesDocAdd', doc }` (auto-numbers SO-####/INV-####),
  `{ kind: 'salesDocUpdate', id, patch: { status?, dispatchStage? } }`.
  Powers the Orders workspace and the Dispatch pipeline (Ready to Pick →
  … → Delivered/Returned). The core flow is **PI → Dispatch → Invoice**:
  a Proforma Invoice (in the PI sheet) is dispatched directly via a
  lightweight `DocType:'PI'` fulfilment-tracking row in `SalesDocs`
  (number = the PI ref), and the Sales Invoice is generated from
  dispatched value. **Sales Orders are an optional advanced stage**
  (off by default, toggle in the Orders header) for businesses needing a
  separate order-confirmation step. PIs are never duplicated; SO/INV
  reference their source via `SourceRef`.

## Why this is faster than Apps Script

| Step | Apps Script | Sheets API |
|---|---|---|
| Cold runtime spin-up | 1-2 sec | none (Vercel keeps function warm) |
| HTTP round-trip | direct to Google | direct to Google |
| Auth | per-request OAuth | cached service-account JWT |
| Typical write latency | 1-3 sec | 200-500 ms |

## Troubleshooting

- **`GOOGLE_SERVICE_ACCOUNT is not valid JSON`** → you pasted only part
  of the file. Paste the entire file contents starting with `{` and
  ending with `}`.
- **`403 The caller does not have permission`** → you didn't share the
  sheet with the service account's `client_email`. Step 2.
- **`Requested entity was not found`** → wrong `SHEETS_SPREADSHEET_ID`,
  or the sheet tab isn't named `Comfort_atlas`. Edit the constant
  `PI_SHEET` at the top of `api/pi.js` if your tab name differs.
- **Function not deploying** → check Vercel's build log. If it says
  "No package.json found" or similar, the function build is being
  skipped — make sure `package.json` at the repo root still lists
  `googleapis` under `dependencies`.

## Falling back to Apps Script

The old Apps Script endpoint at
`apps-script/Code.gs` still works. To revert, change `ATLAS_APPS_SCRIPT_URL`
in `public/index.html` back to the `/exec` URL.
