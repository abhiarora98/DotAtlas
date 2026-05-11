# atlas — Apps Script setup

The dashboard's `Create PI` form and `Add Party` modal need a backend
that can write to your Google Sheet. This folder contains a single
Apps Script file (`Code.gs`) that does exactly that, deployed as a
free web app inside your own Google account. Total setup time: ~3
minutes.

## What you'll be doing

1. Open the Masters spreadsheet you've been sharing.
2. Open its Apps Script editor.
3. Paste in `Code.gs`.
4. Deploy as a web app, accept Google's permissions prompt.
5. Copy the resulting URL (looks like `https://script.google.com/macros/s/.../exec`).
6. Send the URL back so it can be wired into the dashboard.

## Step-by-step

### 1. Open the Apps Script editor

From your Masters Google Sheet:

- **Extensions → Apps Script**

A new browser tab opens with an editor showing a blank `Code.gs`.

### 2. Replace the contents

- Select everything in the editor (`Ctrl/⌘ + A`) and delete it.
- Open `apps-script/Code.gs` in this repo, copy its full contents,
  paste into the editor.

### 3. Check the tab name

At the top of `Code.gs`:

```js
const PI_SHEET_NAME      = 'Comfort_atlas';
const PARTIES_SHEET_NAME = 'Parties';
```

The default is set to `Comfort_atlas` (the tab where Comfort
Industries' PI line items live). Change it if your tab name differs.
Leave `'Parties'` alone — that tab is auto-created the first time
someone adds a party.

### 4. Save

Click the floppy-disk icon, or `Ctrl/⌘ + S`. Name the project
something like **atlas dashboard endpoint**.

### 5. Deploy as a web app

- Click the blue **Deploy** button (top right) → **New deployment**.
- Click the gear icon next to "Select type" → choose **Web app**.
- Fill in:
  - **Description**: `atlas dashboard backend`
  - **Execute as**: **Me** (your account — so the script reads/writes
    your sheet)
  - **Who has access**: **Anyone** — note: this means anyone who
    knows the URL can POST to it; they cannot see the script or
    your sheet directly. For a closed workshop dashboard this is the
    standard setting. If you need stricter access later, switch to
    "Anyone with Google account" — but you'll need to wire OAuth
    into the dashboard, which is more work.
- Click **Deploy**.

### 6. Authorize

Google will prompt you to grant the script permission to act on your
behalf. The dialog will say something like *"This app isn't verified"*
— that's normal for personal Apps Scripts; click **Advanced** →
**Go to atlas dashboard endpoint (unsafe)** → **Allow**.

This grant happens once. You're authorizing **your own script** to
edit **your own sheet** — no third party is involved.

### 7. Copy the URL

After deployment, Google shows a **Web app URL** ending in `/exec`:

```
https://script.google.com/macros/s/AKfycb...long-string.../exec
```

Copy it. Paste it back in chat.

### 8. (Optional) Test the deployment yourself

Paste the URL directly into a new browser tab. You should see:

```json
{"ok":true,"app":"atlas","ready":true,"piSheet":"Masters","partiesSheet":"Parties","time":"..."}
```

If you see that, the script is live and ready.

## What the script does

- **`POST /` with `kind: 'pi'`** (default) → appends N rows to the
  Masters tab, one per line item. Auto-increments the `No.` column
  by reading the last row.
- **`POST /` with `kind: 'party'`** → appends one row to the
  Parties tab. Creates the tab with headers if it doesn't exist.
- **`GET /`** → returns a small JSON heartbeat (useful for testing).

## Updating the script later

Whenever you change `Code.gs`:

1. Paste the new code into the Apps Script editor.
2. Save.
3. **Deploy → Manage deployments** → click the pencil icon next to
   your existing deployment → change **Version** to **New version** →
   click **Deploy**.

The URL stays the same; the code behind it updates. Don't create a
new deployment each time — that gives you a new URL and you'll have
to update the dashboard.

## Troubleshooting

- **The form says "Submit failed: HTTP 401"** → the deployment is set
  to a stricter access level than "Anyone". Open Manage deployments
  and switch back.
- **"Tab 'Masters' not found"** → edit `PI_SHEET_NAME` at the top
  of `Code.gs` and re-deploy a new version.
- **CORS errors in browser console** → make sure the dashboard sends
  `Content-Type: text/plain;charset=utf-8` (it does by default —
  this avoids a CORS preflight that Apps Script doesn't support).
- **Nothing is happening on submit** → open the browser's DevTools
  Console; the form logs the full payload on every submit, even when
  the URL isn't wired.
