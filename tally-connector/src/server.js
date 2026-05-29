/**
 * Local control-panel server. Serves the small UI from public/ and a handful
 * of JSON endpoints the UI calls. Bound to 127.0.0.1 only — this panel is for
 * the operator sitting at the Tally machine, never exposed to the network.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { loadConfig, saveConfig, loadState } = require('./config');
const logger = require('./logger');
const tally = require('./tally/client');
const { runSync } = require('./sync');
const scheduler = require('./scheduler');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

// Never leak the stored API key back to the browser; expose only whether one is set.
function publicConfig() {
  const c = loadConfig();
  return { ...c, apiKey: undefined, hasApiKey: Boolean(c.apiKey) };
}

function serveStatic(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
    res.writeHead(404); return res.end('Not found');
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, route) {
  // GET /api/config — current settings (API key redacted)
  if (route === '/api/config' && req.method === 'GET') {
    return sendJson(res, 200, publicConfig());
  }

  // POST /api/config — save settings, restart scheduler with new interval
  if (route === '/api/config' && req.method === 'POST') {
    const body = await readBody(req);
    // Keep the existing key if the field was left blank in the form.
    if (!body.apiKey) delete body.apiKey;
    saveConfig(body);
    scheduler.restart();
    logger.info('Configuration updated');
    return sendJson(res, 200, publicConfig());
  }

  // GET /api/status — last sync info + recent log lines
  if (route === '/api/status' && req.method === 'GET') {
    return sendJson(res, 200, { ...loadState(), logs: logger.recent().slice(-50) });
  }

  // POST /api/test-connection — verify Tally is reachable, return companies
  if (route === '/api/test-connection' && req.method === 'POST') {
    const c = loadConfig();
    try {
      const companies = await tally.listCompanies(c.tallyHost, c.tallyPort);
      logger.info(`Test connection OK — companies: ${companies.join(', ') || '(none open)'}`);
      return sendJson(res, 200, { ok: true, companies });
    } catch (err) {
      logger.error('Test connection failed: ' + err.message);
      return sendJson(res, 200, { ok: false, error: err.message });
    }
  }

  // POST /api/sync — run a sync right now. Body { full: true } forces a full
  // pull (use after hours / first setup); otherwise it's a quick incremental.
  if (route === '/api/sync' && req.method === 'POST') {
    const body = await readBody(req);
    const result = await runSync({ source: 'manual', full: Boolean(body.full) });
    return sendJson(res, result.ok ? 200 : 500, result);
  }

  res.writeHead(404); res.end('Not found');
}

function startServer() {
  const { uiPort } = loadConfig();
  const server = http.createServer((req, res) => {
    const route = req.url.split('?')[0];
    if (route.startsWith('/api/')) {
      handleApi(req, res, route).catch((err) => {
        logger.error('API error: ' + err.message);
        sendJson(res, 500, { ok: false, error: err.message });
      });
    } else {
      serveStatic(req, res);
    }
  });
  server.listen(uiPort, '127.0.0.1', () => {
    logger.info(`Control panel ready at http://localhost:${uiPort}`);
  });
  return server;
}

module.exports = { startServer };
