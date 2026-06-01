# Native8.ai — UI Prototype

A clickable, front-end-only UI prototype for **Native8.ai**, a WhatsApp-first
AI CRM for product sales teams. No backend — everything is static HTML/CSS/JS
in a single self-contained file (`index.html`), using sample mats-business data
(Ravi Enterprises · 20 outdoor mats · Panipat · delivery Friday).

## Run it

It's a static file. Either:

- Open `public/native8/index.html` directly in a browser, **or**
- Serve the repo and visit `/native8/` (this project deploys `public/` on Vercel).

```bash
npx serve public      # then open http://localhost:3000/native8/
```

## Screens (use the left icon rail to switch)

1. **Inbox** — WhatsApp-style 3-pane: chat list (search · filters · stage badge ·
   priority · unread) → live conversation (bubbles, media/PDF preview, ticks,
   timestamps, AI suggested-reply chips in the composer) → **Native AI CRM panel**
   (customer card, lead-status stepper, AI summary, quick actions, suggested
   replies, customer timeline).
2. **Dashboard** — KPI cards (active / hot leads, today & overdue follow-ups,
   pending quotes, won this month) + charts (sales by rep, conversion donut,
   pipeline funnel) + today's follow-ups.
3. **Pipeline** — drag-and-drop Kanban across New · Contacted · Catalog Sent ·
   Negotiation · Won · Lost.
4. **Customer Detail** — profile, AI chat summary, orders, notes, payment
   status, follow-ups, AI insights.
5. **Extension Concept** — Grammarly-style floating Native popup inside a mocked
   WhatsApp Web. Three states: **Lead detected** (Add Lead form → Save Lead /
   Make Quotation) · Suggested reply · Follow-up reminder. The ✨ button in the
   composer opens Native.

### Quotation workflow (core for product sales)

- **WhatsApp popup:** ✨ Native → Add Lead (name, phone, city, product, qty,
  notes) → **Make Quotation** opens the quote modal.
- **Quote modal (shared):** customer, product, qty, rate, discount, tax,
  delivery timeline, notes — with **live subtotal / discount / GST / total**.
  Buttons: **Generate Quote · Save Draft · Send on WhatsApp** (drops a formatted
  PDF-style quote bubble straight into the open chat).
- **Customer page → Quotations:** table of quote #, amount, date, status,
  converted/not, with New Quote · Edit · Duplicate · Send Again.
- **Dashboard → Quotations:** sent · pending · accepted · conversion %.
- **AI nudge:** when a chat mentions quantity/pricing, Native suggests
  *"Create quotation?"* with product + qty prefilled from the conversation.

## Interactions to try

- Click suggested-reply chips → they drop into the composer.
- Type + Enter / Send → adds an outgoing bubble.
- Click the lead-status stepper → updates the stage (toast).
- Quick actions (Add Lead, Create Quote, Mark Won…) → toast feedback.
- Drag Kanban cards between columns.
- Switch the three extension states.

## Design direction

Minimal, modern, premium SaaS. Native green (`#12A36B`) for action, indigo/violet
(`#6D5AE6`) for AI, authentic WhatsApp chat surfaces. Inter + Plus Jakarta Sans.

> Prototype only — visualize the product before building the Chrome extension.
