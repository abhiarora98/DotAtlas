/**
 * Sends the assembled payload to the Atlas backend.
 *
 *   POST {atlasUrl}     (e.g. https://your-atlas.vercel.app/api/tally/sync)
 *   Authorization: Bearer {apiKey}
 *
 * HTTPS is enforced — the API key must never travel over plain HTTP. The only
 * exception is localhost, so the endpoint can be tested against a dev server.
 */

const logger = require('../logger');

function isAllowedUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

async function postOnce(url, apiKey, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-Atlas-Api-Key': apiKey, // belt-and-suspenders for simple key checks
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Atlas responded HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  try {
    return JSON.parse(body);
  } catch {
    return { ok: true, raw: body };
  }
}

// Retries with exponential backoff (2s, 4s, 8s) on transient failures.
async function sendSync({ atlasUrl, apiKey, payload, retries = 3 }) {
  if (!atlasUrl) throw new Error('Atlas API URL is not configured');
  if (!apiKey) throw new Error('Atlas API key is not configured');
  if (!isAllowedUrl(atlasUrl)) {
    throw new Error('Atlas API URL must use HTTPS (http is only allowed for localhost)');
  }

  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await postOnce(atlasUrl, apiKey, payload);
      logger.info(`Atlas accepted sync on attempt ${attempt}`);
      return result;
    } catch (err) {
      lastErr = err;
      logger.warn(`Atlas sync attempt ${attempt} failed: ${err.message}`);
      if (attempt < retries) {
        const waitMs = 2000 * 2 ** (attempt - 1); // 2s, 4s, 8s
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }
  throw lastErr;
}

module.exports = { sendSync, isAllowedUrl };
