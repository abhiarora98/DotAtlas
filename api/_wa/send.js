// Thin wrapper around the WhatsApp Cloud API send endpoint. Returns silently
// if the env vars are missing — the webhook should still respond 200 so Meta
// doesn't disable it during initial setup.

async function sendWhatsAppMessage(to, body) {
  const id  = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const tok = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!id || !tok) {
    console.warn('[wa/send] WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN missing; skipping send');
    return { skipped: true };
  }
  const url = `https://graph.facebook.com/v20.0/${id}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tok}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body, preview_url: false },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('[wa/send] failed', res.status, txt);
    return { ok: false, status: res.status };
  }
  return { ok: true };
}

module.exports = { sendWhatsAppMessage };
