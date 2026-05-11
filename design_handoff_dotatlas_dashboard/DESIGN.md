# atlas — Design System

The design language of **atlas**, the operating cockpit for business intelligence.
Voice: calm instrumentation. Posture: floor, not sky. Promise: nothing decorative; everything earns its place.

---

## 1. Brand

- **Wordmark:** `atlas` — always lowercase, Manrope 600, tracking −0.05em. Never all-caps, never italicized, never used as part of a sentence ("the atlas team" → "the team at atlas").
- **Symbol:** Tower mark — a tetris-block "A": square capstone resolving up from a wider rectangular base. Used at 14–16px in product chrome; 24–32px in marketing.
- **Tagline:** "Everything moving, every stage." (operational), or "What atlas is noticing." (intelligence).

---

## 2. Color tokens

### Dark (primary surface)
| Token | Value | Use |
|---|---|---|
| `--void` | `#060912` | Page background |
| `--void-2` | `#0A0E18` | Outer chrome |
| `--surface` | `#0F1320` | Card |
| `--surface-2` | `#141828` | Raised card |
| `--surface-3` | `#1A1F30` | Row hover |
| `--surface-4` | `#232A3E` | Pressed / outlined input |
| `--line` | `rgba(255,255,255,0.06)` | Card border |
| `--line-2` | `rgba(255,255,255,0.10)` | Hover border |
| `--line-3` | `rgba(255,255,255,0.18)` | Active / focus border |
| `--text` | `#F2F4F6` | Primary text |
| `--text-2` | `62% alpha` | Secondary |
| `--text-3` | `38% alpha` | Tertiary, eyebrows |
| `--text-4` | `22% alpha` | Disabled, micro labels |

### Accent
| Token | Value | Use |
|---|---|---|
| `--emerald` | `#4EDEA3` | atlas primary accent — live, on-time, healthy, action |
| `--emerald-2` | `#6FFBBE` | gradient stop, highlight |
| `--emerald-soft` | `rgba(78,222,163,0.10)` | filled chip background |
| `--blue` | `#7CA8FF` | secondary accent — info, neutral charts, command palette |
| `--amber` | `#FFB079` | warning, slipping, reminder |
| `--rose` | `#FF8AA8` | risk, overdue, hold |

### Light mode
Tokens flip to: void `#F7F6F2`, surface `#FFFFFF`, text `#0A1628`, emerald `#00A572`. All component CSS is value-agnostic (consumes vars only) — switching `body[data-mode="light"]` is the entire toggle.

---

## 3. Typography

| Family | Use | Weights | Tracking |
|---|---|---|---|
| **Manrope** | Display, headlines, KPIs, party names | 600 / 700 | −0.04em (large) / −0.02em (small) |
| **Inter** | Body, table cells, paragraph copy | 400 / 500 / 600 | 0 |
| **JetBrains Mono** | Numerics, currency, codes, eyebrows | 500 | 0.08em (caps) / 0.04em (numbers) |

### Scale
- H1 hero — Manrope 600, 44px, line-height 1.05
- H2 section — Manrope 600, 28px
- H3 card title — Manrope 600, 14px, +0.01em
- Body — Inter 400, 13.5px, line-height 1.5
- Eyebrow — Mono 500, 10.5–11px, +0.14em, uppercase, color `--text-3`
- Numeric KPI — Manrope 600, 36px, font-variant-numeric: tabular-nums
- Table — Inter 400, 13px; numeric columns Mono 500, 13px, right-aligned

### Editorial pattern
Headlines use two emphasis spans:
- `.em` — primary verb-noun (text color, italic-feel via weight bump)
- `.accent` — consequence noun (emerald)

Example: "Three things matter before 11 AM." → "*Three things* matter before **11 AM**."

---

## 4. Spacing & radius

- **Spacing scale:** 4 / 6 / 8 / 12 / 16 / 20 / 24 / 28 / 32 / 48
- **Card padding:** 18–24px
- **Page padding:** 28px top / 48px sides on desktop
- **Radius:**
  - 4px — chips, pills
  - 6px — buttons, nav items
  - 8px — cards
  - 999px — mode toggle, live badges, avatars

---

## 5. Atmosphere (the layer that makes atlas, atlas)

The cockpit sits in an **operational sky**: subtle, never decorative. Three layers, all `pointer-events: none`, behind `z-index: 2`:

1. **Ambient glow** (`body::before`) — two soft radial gradients, emerald top-left + blue bottom-right, ~5–7% opacity. Implies depth without pattern.
2. **Grain** (`body::after`) — SVG fractal noise at 2.5% opacity. Kills banding on gradients.
3. **Meridians** (`.meridian svg`) — two thin SVG arcs sweeping diagonally, 28% opacity. Reads as orbital / cartographic, not ornamental.

The marketing site adds a starfield and constellation lines. **The product surface does not.** Floor, not sky.

---

## 6. Motion

- **Easing:** `cubic-bezier(0.22, 1, 0.36, 1)` — soft enter, no overshoot.
- **Hover:** 200ms; rows lift bg to `--surface-3`; nav items translate 2px right.
- **Live dot pulse:** 2s ease in/out (opacity 0.5 → 1).
- **Page transition:** instant scroll-to-top; no fade. Speed over showmanship.
- **No bounce, no parallax, no scroll-jacking.** Operators come back 40 times a day.

---

## 7. Component vocabulary

| Component | Anatomy | Notes |
|---|---|---|
| **Sidebar** | Brand → workspace pill → grouped nav (Operate / Sense / Studio) → user pill | 240px, sticky, faint blueprint grid behind |
| **Topbar** | Crumb → ask-atlas pill (⌘K) → icon buttons → theme toggle | Sticky, blur backdrop |
| **Hero header** | Eyebrow (live-dot + meta) → display headline → when-block (right) | 56px padding, soft emerald floor-light |
| **KPI card** | Label + indicator dot → value + unit → delta with arrow | 4-up grid, tabular numerics, sparkline optional |
| **Card** | Header (title + sub + segmented control) + body | Atmospheric border (4% white), top edge brighter |
| **Segmented control** | `.seg button` with `.on` state | Mono caps, 10.5px |
| **Pill** | `.pill-s` + variant `ok/warn/bad/info/muted` | 4px radius, 2px vertical pad |
| **Chip button** | `.chip`, `.chip.emerald` | Mono caps, 11px, +0.08em |
| **Party row** | Name + meta + bar + numeric | 90px progress bar, three-color variants |
| **Table** | Square avatar + name + secondary line; numerics right-mono | No zebra; row dividers at `--line` |
| **Signal** | Pip (status color) + title (mixed weight) + meta + actions | Primary action emerald; supports inline detail |
| **Live dot** | 6px emerald dot, glow + pulse | Used in eyebrows only |
| **Mode toggle** | ☽ / ☼ icon button | Press T anywhere outside inputs |

---

## 8. Data shape (Comfort Mats universe)

The dashboard is wired to a **mats & flooring manufacturer** — Comfort Mats Pvt. Ltd., Panipat. Replace party names, SKUs, and money with your domain, but preserve the **shape** of the model — the IA depends on it:

```ts
Party    { id; name; city; type; gmv90; onTimePct; aging; status }
Order    { id; partyId; stage; value; skuCount; eta; createdAt }
SKU      { id; name; category; size; warehouse; onHand; par; daysOfCover; status }
Vehicle  { id; number; driver; stage; loadPct; stops; eta }
Invoice  { id; partyId; amount; agedDays; status }
Signal   { id; severity; title; detail; confidence; actions[]; createdAt }
Workflow { id; name; etaMin; steps[] }
```

`Signal` is the spine. Everything atlas surfaces routes through it — drafted, ranked, audited, optionally auto-actioned at 90%+ confidence.

---

## 9. Voice

- **Headlines** — declarative, two-clause, present-tense.
  - "Who owes you, and how long."
  - "Wheels turning, e-way bills clean."
- **Eyebrows** — context + freshness.
  - "Receivables · ₹1.18 Cr outstanding"
  - "Intelligence · 312 signals · last 24h"
- **Signal text** — bold the *quantity*, color the *consequence*.
  - "Margin on Foot Mat dropped **1.4 points**. TEFNO raised raw 3.2% on 6 May…"
- **No exclamations. No emoji. No "let's", no "awesome", no "exciting".**

---

## 10. Anti-patterns (do not)

- ❌ Dashboards over star/space backgrounds (kept for marketing only)
- ❌ Heavy drop shadows or glassmorphism on cards
- ❌ Rounded-corner gradient hero blocks with left-border accents
- ❌ AI assistant chips with "Pro tip!" or rainbow gradients
- ❌ Emoji in UI copy
- ❌ Sentence-case proper nouns for the brand ("Atlas") — always `atlas`
- ❌ Tabular data without right-aligned tabular-nums
- ❌ Animation on data that doesn't actually change

---

## 11. File map

- `dotatlas dashboard.html` — single-file reference, 11 routes
- `brand/atlas-tokens.css` — base brand variables
- `README.md` — handoff instructions
- `DESIGN.md` — this file

End.
