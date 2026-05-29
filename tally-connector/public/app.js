/* Frontend for the connector control panel. Plain fetch + DOM, no framework. */

const $ = (id) => document.getElementById(id);
const FIELDS = ['tallyHost', 'tallyPort', 'atlasUrl', 'pollMinutes'];

async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

function flash(el, ok, text) {
  el.className = 'msg ' + (ok ? 'ok' : 'err');
  el.textContent = text;
}

async function loadConfig() {
  const c = await api('/api/config');
  FIELDS.forEach((f) => { if (c[f] != null) $(f).value = c[f]; });
  if (c.hasApiKey) $('apiKey').placeholder = '•••••• (saved — leave blank to keep)';
  setCompanyOptions(c.company ? [c.company] : [], c.company);
}

function setCompanyOptions(companies, selected) {
  const sel = $('company');
  const current = selected || sel.value;
  sel.innerHTML = '<option value="">(company open in Tally)</option>';
  companies.forEach((name) => {
    const o = document.createElement('option');
    o.value = name; o.textContent = name;
    if (name === current) o.selected = true;
    sel.appendChild(o);
  });
}

function collectConfig() {
  const cfg = {};
  FIELDS.forEach((f) => (cfg[f] = $(f).value.trim()));
  cfg.company = $('company').value;
  const key = $('apiKey').value.trim();
  if (key) cfg.apiKey = key;
  return cfg;
}

async function save() {
  await api('/api/config', 'POST', collectConfig());
  $('apiKey').value = '';
  flash($('msg'), true, 'Settings saved.');
  loadConfig();
}

async function testConnection() {
  $('testBtn').disabled = true;
  flash($('msg'), true, 'Testing connection to Tally…');
  await api('/api/config', 'POST', collectConfig()); // persist before testing
  const r = await api('/api/test-connection', 'POST');
  if (r.ok) {
    flash($('msg'), true, `Connected. Companies: ${r.companies.join(', ') || '(none open)'}`);
    setCompanyOptions(r.companies, $('company').value);
  } else {
    flash($('msg'), false, 'Connection failed: ' + r.error);
  }
  $('testBtn').disabled = false;
}

async function syncNow(full = false) {
  const btn = full ? $('fullSyncBtn') : $('syncBtn');
  btn.disabled = true;
  flash($('msg'), true, (full ? 'Full sync' : 'Syncing') + '… this can take a moment.');
  await api('/api/config', 'POST', collectConfig());
  const r = await api('/api/sync', 'POST', { full });
  if (r.ok && r.skipped) {
    flash($('msg'), true, 'Nothing was due to sync right now.');
  } else if (r.ok) {
    const total = Object.values(r.counts || {}).reduce((a, b) => a + b, 0);
    flash($('msg'), true, `${r.isFull ? 'Full sync' : 'Sync'} complete — ${total} records sent to Atlas.`);
  } else {
    flash($('msg'), false, 'Sync failed: ' + r.error);
  }
  btn.disabled = false;
  refreshStatus();
}

async function refreshStatus() {
  const s = await api('/api/status');
  const pill = $('statusPill');
  pill.className = 'pill ' + (s.lastStatus || 'never');
  pill.textContent = s.lastStatus || 'never';
  $('lastSync').textContent = s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString() : '—';
  $('totalSyncs').textContent = s.totalSyncs || 0;

  const counts = s.lastCounts || {};
  $('counts').innerHTML = Object.keys(counts).length
    ? Object.entries(counts).map(([k, v]) => `<span>${k}: <b>${v}</b></span>`).join('')
    : '';

  const err = $('errMsg');
  if (s.lastStatus === 'error' && s.lastError) flash(err, false, s.lastError);
  else err.style.display = 'none';

  $('logs').textContent = (s.logs || []).join('\n') || 'No activity yet.';
}

$('saveBtn').onclick = save;
$('testBtn').onclick = testConnection;
$('syncBtn').onclick = () => syncNow(false);
$('fullSyncBtn').onclick = () => syncNow(true);

loadConfig();
refreshStatus();
setInterval(refreshStatus, 5000);
