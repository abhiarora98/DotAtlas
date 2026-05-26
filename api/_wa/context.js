// Per-phone conversation memory for the WhatsApp bot. Persisted as one row
// per phone in a `WA_Context` tab of the same Google Sheet the dashboard uses
// — same auth, no extra infra. Schema is plain so a human can eyeball it.

const WA_SHEET = process.env.WA_CONTEXT_SHEET_NAME || 'WA_Context';
const HEADERS = ['Phone', 'CurrentParty', 'LastIntent', 'LastQuickReplies', 'UpdatedAt'];

async function ensureTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || [])
    .some(s => s.properties && s.properties.title === WA_SHEET);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        addSheet: {
          properties: {
            title: WA_SHEET,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      }],
    },
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${WA_SHEET}!A1:E1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADERS] },
  });
}

function parseQR(s) {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function getContext(sheets, spreadsheetId, phone) {
  await ensureTab(sheets, spreadsheetId);
  const r = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${WA_SHEET}!A:E`,
  });
  const rows = r.data.values || [];
  for (let i = 1; i < rows.length; i++) {
    if ((rows[i][0] || '').toString() === phone) {
      return {
        phone,
        currentParty:     rows[i][1] || '',
        lastIntent:       rows[i][2] || '',
        lastQuickReplies: parseQR(rows[i][3]),
        updatedAt:        rows[i][4] || '',
        _row: i + 1,
      };
    }
  }
  return {
    phone, currentParty: '', lastIntent: '',
    lastQuickReplies: [], updatedAt: '', _row: null,
  };
}

// patch may contain: currentParty, lastIntent, lastQuickReplies.
// If a key is undefined, the existing value is kept. To wipe quickReplies,
// pass [] (empty array). null/undefined → keep.
async function setContext(sheets, spreadsheetId, phone, patch) {
  const cur = await getContext(sheets, spreadsheetId, phone);
  const next = {
    currentParty:     patch.currentParty     != null ? patch.currentParty     : cur.currentParty,
    lastIntent:       patch.lastIntent       != null ? patch.lastIntent       : cur.lastIntent,
    lastQuickReplies: patch.lastQuickReplies != null ? patch.lastQuickReplies : cur.lastQuickReplies,
    updatedAt:        new Date().toISOString(),
  };
  const row = [
    phone,
    next.currentParty || '',
    next.lastIntent || '',
    JSON.stringify(next.lastQuickReplies || []),
    next.updatedAt,
  ];
  if (cur._row) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${WA_SHEET}!A${cur._row}:E${cur._row}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${WA_SHEET}!A:E`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
  }
}

module.exports = { getContext, setContext };
