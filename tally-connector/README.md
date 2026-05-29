# Atlas · TallyPrime Connector

A lightweight local connector that runs on the same Windows machine/server as
**TallyPrime**, pulls accounting data over Tally's XML/HTTP API, converts it to
clean JSON, and syncs it to the **Atlas** backend.

```
TallyPrime  →  Atlas Connector (this app)  →  Atlas API  →  Atlas dashboard + WhatsApp
```

It is built to stay out of Tally's way: **incremental pulls by default**, full
pulls only on first install / overnight, per-module cadence, and a single sync
at a time. Tally stays responsive while people enter vouchers.

---

## What it syncs

| Module | Atlas array | Cadence (default) |
|---|---|---|
| Ledger masters | `ledgers` | every 15 min (incremental) |
| Sales vouchers | `sales` | every 5 min (incremental) |
| Receipt vouchers | `receipts` | every 5 min (incremental) |
| Outstanding / receivables | `receivables` | every 5 min |
| Purchase vouchers | `purchases` | every 20 min (incremental) |
| GST summary | `gst_summary` | full sync only (derived from sales + purchases) |

Payload posted to `POST {atlasUrl}`:

```json
{
  "company": "Acme Traders",
  "synced_at": "2026-05-29T09:30:00.000Z",
  "mode": "incremental",
  "ledgers": [], "sales": [], "receipts": [],
  "receivables": [], "purchases": [], "gst_summary": []
}
```

---

## How it stays light on Tally

- **Incremental by AlterID.** Tally stamps every master/voucher with a
  monotonic `AlterID`. The connector remembers the highest one it has seen and
  asks only for records with a higher `AlterID` — so a routine sync fetches just
  what changed, not the whole book.
- **Full sync is rare.** A full pull runs only on first install or overnight
  inside `fullSyncWindowStart`–`fullSyncWindowEnd` (default 22:00–06:00), at most
  once per `fullSyncMinGapHours`. Never repeatedly during working hours. You can
  also trigger one manually with the **Full sync** button (use after hours).
- **Per-module cadence.** Cheap/urgent data (receivables, sales) refreshes every
  poll; heavier data (purchases) less often; GST summary only on full sync.
- **Narrow queries.** Each request asks for a fixed, minimal field set for the
  current company only — no broad "all companies / all fields" dumps.
- **Request spacing.** A short pause (`requestSpacingMs`) between Tally requests
  avoids bursting the server while vouchers are being entered.
- **Single-flight queue.** If a sync is still running, the next trigger is
  dropped — syncs never pile up.
- **Checkpoint on success.** Checkpoints advance only after Atlas confirms
  receipt. A failed sync (Tally down, network blip) safely re-pulls the same
  delta next time — no data lost, no duplicates of the checkpoint.

> Dashboards and WhatsApp queries should read from the **Atlas database**, never
> from Tally directly. The connector is the only thing that talks to Tally, and
> it does so on a calm schedule.

---

## Prerequisites

1. **TallyPrime** running on the machine, with the XML/HTTP server enabled:
   - Gateway of Tally → **F1: Help → Settings → Connectivity** (or
     `F12 → Advanced Configuration` on older builds)
   - Set **TallyPrime acts as → Both**, **Enable ODBC/HTTP**, Port **9000**.
   - Keep the company you want to sync **open** in Tally.
2. **Node.js 18+** (LTS recommended). Download from <https://nodejs.org>.

---

## Install (Windows)

1. Copy the `tally-connector` folder onto the Tally machine (e.g.
   `C:\atlas-tally-connector`).
2. Open **Command Prompt** in that folder and install dependencies:
   ```bat
   npm install
   ```
3. Create your config from the template:
   ```bat
   copy config.example.json config.json
   ```
   Edit `config.json` and set at least `atlasUrl` and `apiKey`. (You can also do
   this later from the UI.)
4. Start the connector:
   ```bat
   npm start
   ```
5. Open <http://localhost:8765> in a browser. Fill in the fields, click
   **Test connection**, pick the company, then **Save settings**.

The connector now polls automatically. Press **Sync now** any time for an
immediate incremental refresh, or **Full sync** for a complete pull.

### Run it on startup / keep it running

Use one of these so the connector restarts with Windows and survives crashes:

- **PM2** (simple):
  ```bat
  npm install -g pm2 pm2-windows-startup
  pm2-startup install
  pm2 start src/index.js --name atlas-tally
  pm2 save
  ```
- **NSSM** (run as a Windows Service): point NSSM at `node.exe` with argument
  `src\index.js` and the connector folder as the working directory.

---

## The local UI

- **Fields:** Tally host, Tally port, Atlas API URL, API key, company selector,
  poll interval.
- **Buttons:** Test connection, Sync now, Full sync, Save settings.
- **Shows:** status pill, last sync time, total syncs, records synced per module,
  last error, and a live tail of recent activity.

The UI binds to `127.0.0.1` only — it is not exposed to the network.

---

## Authentication & security

- All Atlas traffic is **HTTPS only** (plain HTTP is rejected except for
  `localhost`, for dev).
- The API key is sent as `Authorization: Bearer <key>` (and `X-Atlas-Api-Key`).
- `config.json` holds the key and is **git-ignored** — keep it on the machine.

On the Atlas side, set `ATLAS_TALLY_API_KEY` (or comma-separated
`ATLAS_TALLY_API_KEYS`) to the same secret. The receiver lives at
[`api/tally/sync.js`](../api/tally/sync.js) and writes each module to its own
tab in the Atlas Google Sheet.

---

## Files & state

```
config.json   ← your settings + API key (git-ignored)
state.json    ← last sync time, status, counts, AlterID checkpoints (git-ignored)
logs/         ← rolling local logs (git-ignored)
```

To force a fresh full baseline, stop the connector and delete `state.json`.

---

## Configuration reference

| Key | Default | Meaning |
|---|---|---|
| `tallyHost` / `tallyPort` | `localhost` / `9000` | Tally XML/HTTP endpoint |
| `atlasUrl` | — | `…/api/tally/sync` endpoint |
| `apiKey` | — | Atlas shared secret |
| `company` | (open company) | Company to sync |
| `pollMinutes` | `5` | Base poll tick |
| `uiPort` | `8765` | Local control-panel port |
| `moduleIntervals` | see above | Minutes between pulls per module |
| `fullSyncWindowStart`/`End` | `22` / `6` | Overnight full-sync hours |
| `fullSyncMinGapHours` | `20` | Min gap between full syncs |
| `fullSyncLookbackDays` | `366` | History pulled on a full sync |
| `requestSpacingMs` | `400` | Pause between Tally requests |

---

## Test

A no-Tally, no-Atlas end-to-end test (fake servers + the real code path):

```bat
node test/e2e.test.js
```

It verifies XML parsing, the tax breakup, AlterID checkpointing, full-vs-
incremental gating, and the assembled payload shape.

---

## Notes / known limits (MVP)

- TDL field names vary slightly across Tally versions/regions. The parser is
  defensive (missing fields → blank), but if a field comes back empty, adjust
  the `NATIVEMETHOD`/`FETCH` lines in `src/tally/requests.js`.
- `gst_summary` is **derived** from the synced sales + purchases (monthly
  rollup), not pulled from Tally's GSTR reports — accurate enough for dashboards
  and WhatsApp, and far cheaper than the GSTR report XML.
- Receivables (open bills) are recomputed each pull (no AlterID on derived
  balances), but the collection is naturally small and filtered to non-zero
  pending amounts.
