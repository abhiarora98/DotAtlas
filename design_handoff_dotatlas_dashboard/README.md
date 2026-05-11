# Handoff: atlas Cockpit Dashboard

## Overview
This is the **atlas operating cockpit** for Comfort Mats Pvt. Ltd. — a B2B BI & operations dashboard covering 11 surfaces:

- **Operate** — Today, Orders, Parties, Inventory, Dispatch
- **Sense** — Cash & finance, Receivables, Intelligence, Reports
- **Studio** — Workflows, Settings

Voice: "calm instrumentation." Aesthetic: deep navy + emerald, Manrope display, Inter body, JetBrains Mono for numerics. Time-aware hero copy (morning brief / midday ops / evening wrap), live signal feed, anomaly detection.

## About the design files
The files here are **design references created in HTML** — a prototype showing intended look and behavior, not production code to copy directly. Recreate this in your codebase's existing environment (React/Next/Vue/etc.) using its established patterns. If no environment exists yet, React + Vite + TypeScript with CSS Modules or vanilla CSS variables is the natural fit (the existing token system is plain CSS custom properties).

## Fidelity
**High-fidelity.** Pixel-perfect colors, type, spacing, motion. Recreate exactly.

## How to use this bundle with Claude Code

1. **Unzip into your repo** (or a sibling folder next to it).
2. **Open the repo in Claude Code.**
3. **Prompt Claude Code:**
   > "Implement the design described in `design_handoff_dotatlas_dashboard/README.md`. The reference HTML is at `design_handoff_dotatlas_dashboard/dotatlas dashboard.html` — open it in a browser to see the target. Recreate it as React components in this codebase using our existing patterns. Start with the layout shell (sidebar + topbar + page slot) and the Today page, then route the remaining 10 pages."
4. Iterate page-by-page. Each `<section class="page" data-page="…">` in the HTML is one route/component.

## Routing
- 11 pages live in one HTML; nav clicks call `setPage(id)` which toggles `[hidden]` on `<section.page>` elements and updates `location.hash`.
- In a real app: use your router (Next App Router, React Router, TanStack Router). One route per page, e.g. `/today`, `/orders`, `/parties` …
- Crumb retitles per page. Sidebar groups: Operate / Sense / Studio.

## Design tokens

### Colors (dark — primary)
```
--bg-deep      #050a14   page background
--bg-base      #081425   surface
--bg-1         #0E1A2C   card
--bg-2         #152031   raised card
--bg-3         #1F2A3C   hover
--line         rgba(255,255,255,0.06)
--line-2       rgba(255,255,255,0.10)
--line-3       rgba(255,255,255,0.18)
--text-1       #D8E3FB   primary text
--text-2       #A8B5CC   secondary
--text-3       #6E7A8E   tertiary
--text-4       #4A5568   quaternary
--em           #4EDEA3   atlas emerald (primary accent)
--em-2         #6FFBBE   emerald bright
--em-soft      rgba(78,222,163,0.10)
--em-mute      rgba(78,222,163,0.20)
--amber        #F59E0B   warning
--rose         #FF8A8A   danger
--blue         #6FB0FF   info
```

### Typography
- **Display:** Manrope 700/600 — headings, KPIs, party names. Tracking −0.02em on big sizes.
- **Body:** Inter 400/500/600 — paragraph copy, table cells.
- **Mono:** JetBrains Mono 500 — numbers, currency, codes, eyebrows. Tracking 0.08em (caps), 0.04em (numbers).
- **Eyebrow:** Mono caps, 10.5–11px, tracking 0.14em, color text-2.

### Spacing
4 / 6 / 8 / 12 / 16 / 20 / 24 / 28 / 32 / 48. Card padding 18–24px. Page padding 28px top / 48px sides.

### Radius
4 (chips/pills) · 6 (buttons) · 8 (cards) · 999 (mode toggle, live badges).

### Shadows
- Dark mode: `none` on cards (rely on border), `0 16px 48px rgba(0,0,0,0.4)` on modals.
- Light mode: `0 1px 3px rgba(10,22,40,0.04)` on cards.

## Component inventory (use existing in your codebase or build minimal)

| Component | Used in | Notes |
|---|---|---|
| Sidebar (rail) | All pages | 220px, sticky, grouped nav with badges |
| Topbar | All pages | Crumb left, time + search + actions right |
| Hero header | All pages | Eyebrow + display headline with em + accent spans + when-block |
| KPI card | Today, Orders, Parties, Inventory, Dispatch, Cash, Receivables, Intel | 4-up grid; label / indicator dot / value + unit / delta |
| Range bar | Orders, Intel | Pill segmented control + chip actions |
| Card | All | Header (title + sub + seg) + body |
| Segmented control | Many | `.seg button` + `.on` state |
| Pill | All | `.pill-s` + variant `ok/warn/bad/info/muted` |
| Table | Orders, Inventory, Receivables, Reports | Square avatar + name/sec; numeric columns right-aligned mono |
| Party row | Parties, Cash, Dispatch, Workflows, Settings | Name + bar + numeric, used for ranked lists |
| Signal | Today, Intel, Workflows | Pip + title + meta + actions; primary action emerald |
| Chip button | Range bar | Mono caps, 11px, tracking 0.08em |
| Live dot | Eyebrows | 6px green dot with pulse animation |
| Mode toggle | Topbar | Pill, dark/light, persisted via localStorage('atlas-mode') |

## Interactions
- **Nav click** → `setPage(id)` toggles `.page[hidden]` and updates `#hash`. Scroll resets to top.
- **Mode toggle** → flips `body[data-mode]`, all tokens re-resolve via CSS vars. Persisted in localStorage.
- **Hash deep-link** → on load, `location.hash` is read and applied.
- **Hover** on rows: row bg lifts to `--bg-3`.
- **Live dot** pulses (`@keyframes pulse`, 2s).
- **Time-aware label**: read clock at load, branch to morning/midday/evening/week-start/week-close. Affects hero eyebrow + headline.

## State
- `currentPage` (string, default 'today').
- `mode` ('dark' | 'light', persisted).
- `timeMode` (derived from `new Date()`).
- All data is currently inline mock — wire to your backend per the data model below.

## Data model (Comfort Mats universe)

```ts
type Party = { id; name; city; type:'customer'|'supplier'; gmv90; onTimePct; aging; status; watchlistReason? }
type Order = { id; partyId; stage:'draft'|'confirmed'|'picking'|'dispatched'|'hold'; value; skuCount; eta; createdAt }
type SKU   = { id; name; category; size; warehouse; onHand; par; daysOfCover; status:'critical'|'low'|'healthy'|'slow' }
type Vehicle = { id; number; driver; warehouse; stage:'loading'|'enroute'|'delivered'; loadPct; stops; eta }
type Invoice = { id; partyId; amount; agedDays; status:'due'|'overdue'|'hold'|'paid' }
type Signal  = { id; severity:'info'|'opportunity'|'risk'|'critical'; title; detail; confidence; actions:[]; createdAt; resolvedAt? }
type Workflow = { id; name; etaMin; steps:{ name; detail; status:'done'|'active'|'pending' }[] }
type Integration = { name; type; status:'healthy'|'reconnect'|'down'; lastSync }
```

## Files in this bundle
- `dotatlas dashboard.html` — full reference, open in a browser.
- `brand/atlas-tokens.css` — base atlas brand tokens (the dashboard inlines its own dark-mode tokens on top).
- `README.md` — this file.

## Brand
atlas wordmark is **lowercase**, semi-bold, tracking −0.05em. The Tower mark (tetris-block A — square cap on stacked rectangular base) is in the topbar/sidebar at 14–16px.

## Voice samples (carry through to copy)
- "Everything moving, every stage."
- "Who owes you, and how long."
- "What atlas is noticing, ranked by consequence."
- "The wiring behind the surface."

Plain words, em-spans for the kinetic verb, accent-spans for the consequence noun. Avoid jargon, exclamation marks, and emoji.
