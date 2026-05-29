/**
 * Tiny local logger. Appends to logs/connector.log and keeps the last N lines
 * in memory so the UI can show recent activity without reading the file.
 */

const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');

const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'connector.log');
const MAX_MEMORY_LINES = 200;

const recent = [];

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function write(level, msg) {
  const line = `${new Date().toISOString()} [${level}] ${msg}`;
  recent.push(line);
  if (recent.length > MAX_MEMORY_LINES) recent.shift();
  try {
    ensureDir();
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // Logging must never crash the sync; ignore disk errors.
  }
  // Mirror to console for when the connector runs in a terminal window.
  (level === 'ERROR' ? console.error : console.log)(line);
}

module.exports = {
  LOG_FILE,
  info: (msg) => write('INFO', msg),
  warn: (msg) => write('WARN', msg),
  error: (msg) => write('ERROR', msg),
  recent: () => recent.slice(),
};
