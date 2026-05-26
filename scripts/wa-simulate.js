#!/usr/bin/env node
/**
 * Local CLI tester for the WhatsApp Receivables Assistant.
 *
 *   node scripts/wa-simulate.js "Sunny outstanding"
 *   node scripts/wa-simulate.js "1"        # uses last context for the fixed test phone
 *   node scripts/wa-simulate.js --phone=918888888888 "ledger Sunny"
 *
 * Reads from the same Google Sheet the live bot uses. Stubs the WhatsApp
 * send so nothing leaves your machine — the reply is printed to stdout.
 *
 * Required env: GOOGLE_SERVICE_ACCOUNT, SHEETS_SPREADSHEET_ID.
 */

process.env.WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || 'stub';
process.env.WHATSAPP_ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN    || 'stub';

const path = require('path');
const sendMod = require(path.join('..', 'api', '_wa', 'send'));
sendMod.sendWhatsAppMessage = async (to, body) => {
  console.log('───────── reply to', to, '─────────');
  console.log(body);
  console.log('───────── end reply ─────────');
};

// Re-require AFTER patching send so whatsapp.js picks up the stub.
delete require.cache[require.resolve(path.join('..', 'api', '_wa', 'send'))];
require.cache[require.resolve(path.join('..', 'api', '_wa', 'send'))] = {
  exports: sendMod,
};

const handler = require(path.join('..', 'api', 'whatsapp'));

(async () => {
  const args = process.argv.slice(2);
  let phone = '919999999999';
  const text = args.filter(a => {
    const m = a.match(/^--phone=(.+)$/);
    if (m) { phone = m[1]; return false; }
    return true;
  }).join(' ');

  if (!text) {
    console.error('Usage: node scripts/wa-simulate.js [--phone=...] "<message>"');
    process.exit(1);
  }

  const payload = {
    entry: [{ changes: [{ value: { messages: [{ from: phone, type: 'text', text: { body: text } }] } }] }],
  };
  const req = { method: 'POST', body: payload, query: {} };
  const res = {
    status(code) { this._code = code; return this; },
    send(b)      { console.log('[http]', this._code, (b || '').toString().slice(0, 200)); return this; },
    end()        { console.log('[http]', this._code, '(end)'); return this; },
  };

  await handler(req, res);
})().catch(e => { console.error(e); process.exit(1); });
