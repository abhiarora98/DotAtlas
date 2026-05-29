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

// Split a multi-module payload into POST-sized chunks. Each chunk carries the
// shared base (company, synced_at, mode) plus a slice of rows totalling at most
// `rowsPerRequest`. A module's rows never span chunks awkwardly — we just fill
// each chunk module-by-module until it's full. Returns [] when there are no
// rows at all (caller decides whether to send a heartbeat).
function chunkPayload(base, modules, rowsPerRequest = 800) {
  const limit = Math.max(1, rowsPerRequest);
  const chunks = [];
  let current = null;
  let currentCount = 0;

  const flush = () => {
    if (current) chunks.push(current);
    current = null;
    currentCount = 0;
  };

  for (const [module, rows] of Object.entries(modules)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;
    for (let i = 0; i < rows.length; i += limit) {
      const slice = rows.slice(i, i + limit);
      if (currentCount && currentCount + slice.length > limit) flush();
      if (!current) current = { ...base };
      current[module] = (current[module] || []).concat(slice);
      currentCount += slice.length;
      if (currentCount >= limit) flush();
    }
  }
  flush();
  return chunks;
}

// Send a full module map to Atlas in row-capped chunks, sequentially so we
// never hold or transmit an oversized body. Aggregates per-chunk results.
async function sendSyncChunked({ atlasUrl, apiKey, base, modules, rowsPerRequest, retries }) {
  const chunks = chunkPayload(base, modules, rowsPerRequest);
  if (!chunks.length) return { ok: true, chunks: 0, results: [] };
  const results = [];
  for (let i = 0; i < chunks.length; i++) {
    results.push(await sendSync({ atlasUrl, apiKey, payload: chunks[i], retries }));
  }
  return { ok: true, chunks: chunks.length, results };
}

module.exports = { sendSync, sendSyncChunked, chunkPayload, isAllowedUrl };
