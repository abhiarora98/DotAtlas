# Atlas — WhatsApp Receivables Assistant

A WhatsApp-first read layer over the receivables data the dashboard already
shows. The owner texts the bot ("Sunny outstanding", "overdue", "ledger",
"remind") and gets back instant, mobile-formatted answers computed from the
same `Comfort_atlas` Google Sheet.

- **Webhook entry**: `api/whatsapp.js` (Vercel route `/api/whatsapp`)
- **Helpers**:    `api/_wa/{parser,queries,formatter,context,send,format}.js`
- **Conversation memory**: `WA_Context` tab in the same sheet, auto-created
  on first message (one row per phone)

v1 is read-only — replies never reach customers. The `remind` intent returns a
draft for the owner to copy or edit; the bot itself doesn't message anyone
outside the owner's own thread.

## Supported intents

| Intent              | Examples                                                      |
| ------------------- | ------------------------------------------------------------- |
| `receivable_summary`| `Sunny outstanding`, `Sunny baki`, `Sunny kitna lena`, `Sunny`|
| `overdue_list`     | `overdue Sunny`, `show overdue`, `1` after summary             |
| `ledger_summary`   | `Sunny ledger`, `Sunny khata`, `ledger`                        |
| `reminder`         | `remind`, `remind Sunny`                                       |
| `help`             | `hi`, `hey`, `help`, `menu`                                    |
| `receipts_today`   | placeholder — see below                                        |

**Receipts** are a v2 item: the PI sheet only has a cumulative
`Total Received` per PI (no payment date), so the bot can't truthfully answer
"receipts today". For now it replies `"Receipts tracking with dates is coming
soon."`.

**Overdue cutoff** is `> OVERDUE_DAYS` days since `PI Date` (default `30`).

## Meta setup (one-time)

1. **WhatsApp Business app** — at https://developers.facebook.com/apps, create
   an app (type: *Business*). Add the **WhatsApp** product.
2. **Test phone** — in WhatsApp → API Setup, copy the **Phone number ID** (the
   numeric one, not the display number). Add your own number under
   "To" → **Manage phone number list** so Meta lets you receive test messages.
3. **Access token** — for testing, the temporary token at the top of API Setup
   works. For production, create a **System User** under Business Settings →
   Users → System Users, give it `whatsapp_business_messaging` permission on
   the app, and generate a permanent token.
4. **Verify token** — invent any random string; you'll paste the same string
   in two places (Vercel env + Meta webhook config).
5. **Vercel env vars** (Project → Settings → Environment Variables; add to all
   three environments):

   | Variable                   | Value                                                |
   | -------------------------- | ---------------------------------------------------- |
   | `WHATSAPP_VERIFY_TOKEN`    | the random string from step 4                        |
   | `WHATSAPP_ACCESS_TOKEN`    | the token from step 3                                |
   | `WHATSAPP_PHONE_NUMBER_ID` | the numeric Phone number ID from step 2              |
   | `OVERDUE_DAYS`             | optional, default `30`                               |
   | `SHEETS_TIMEOUT_MS`        | optional, default `8000`                             |

   The existing `GOOGLE_SERVICE_ACCOUNT` and `SHEETS_SPREADSHEET_ID` are
   already in place from `api/pi.js`.

6. **Redeploy** so the new env vars are picked up.

7. **Webhook subscription** — WhatsApp → Configuration:
   - **Callback URL**: `https://<your-vercel-domain>/api/whatsapp`
   - **Verify token**: same value as `WHATSAPP_VERIFY_TOKEN`
   - Click **Verify and save**. Meta makes a `GET` with `hub.mode=subscribe`;
     we echo the `hub.challenge` only if the token matches.
   - **Webhook fields** → subscribe to **messages**.

8. **Test** — send a message from your registered tester phone. Try:

   ```
   hi
   <your real party name> outstanding
   1
   overdue
   remind
   ```

## Local testing

Without Meta, you can drive the handler end-to-end from your terminal — it
reads the live Sheet and prints what the reply *would* be:

```bash
# uses the same GOOGLE_SERVICE_ACCOUNT / SHEETS_SPREADSHEET_ID you set in Vercel
export GOOGLE_SERVICE_ACCOUNT='...'
export SHEETS_SPREADSHEET_ID='...'

node scripts/wa-simulate.js "Sunny outstanding"
node scripts/wa-simulate.js "1"            # same fake phone; resolves quick reply
node scripts/wa-simulate.js --phone=918888 "ledger Sunny"
```

The send is stubbed, so nothing is actually sent. `WA_Context` *is* updated
in the real sheet — pick a fake phone like `919999999999` to keep test rows
identifiable.

## Verification checklist

- [ ] GET `/api/whatsapp?hub.mode=subscribe&hub.verify_token=<correct>&hub.challenge=xyz`
      → body `xyz`, status `200`. Wrong token → `403`.
- [ ] Empty/garbage POST bodies → `200` (don't trip Meta's webhook health).
- [ ] `hi` → help menu.
- [ ] `<party> outstanding` → summary with 1/2/3 menu and totals that match
      `Total (inc GST) − Total Received` summed across that party's PIs.
- [ ] `1` after a summary → overdue list for the same party.
- [ ] `overdue <other party>` → switches `currentParty`.
- [ ] `remind` → draft text ending `COPY / EDIT`; no message sent to the
      customer.
- [ ] `receipts today` → coming-soon string verbatim.
- [ ] Unknown party `"foo bar"` → fallback with 3 suggested parties; previous
      `currentParty` and `lastQuickReplies` in `WA_Context` are preserved.
- [ ] Zero-outstanding party → 🎉 reply with ledger/help options.
- [ ] `Suny baki` / `Pesawar` → fuzzy-match auto-resolves to the real party.
- [ ] Force a Sheets failure (break `SHEETS_SPREADSHEET_ID` on preview) →
      user gets the "Atlas is taking a little longer than usual." message,
      webhook still returns `200`.

## Troubleshooting

- **"Verify and save" fails** — verify-token mismatch or env var not yet
  deployed. Check Vercel → Deployments to confirm the latest env vars are live.
- **Bot doesn't reply** — check Vercel function logs. `[wa/send] failed 401`
  means the access token is wrong or expired. `[wa/send] WHATSAPP_*` warning
  means the env vars aren't set on the env you're deploying.
- **"Couldn't find party 'X'"** — bot matches against `PARTY NAME` (col C) of
  the PI sheet. If a party only exists in the `Parties` tab but has no PIs,
  it won't appear. Add a PI first.
- **Numbers don't match dashboard** — both read the same `aggregatePIs()` in
  `api/pi.js`; if they disagree, suspect blank/duplicate `Total Received`
  cells on the PI sheet.
