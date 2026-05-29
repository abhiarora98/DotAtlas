/**
 * Background poller — the base "tick". Fires every `pollMinutes` (default 5)
 * and hands off to the sync engine, which decides per tick whether anything is
 * due, and whether this should be a light incremental pull or (only on first
 * install / overnight) a full pull. The first tick waits one interval so the
 * UI is up first; the user can always press "Sync now" immediately.
 */

const { loadConfig } = require('./config');
const logger = require('./logger');
const { runSync } = require('./sync');

let timer = null;

function start() {
  stop();
  const minutes = loadConfig().pollMinutes || 5;
  const intervalMs = Math.max(1, minutes) * 60 * 1000;
  logger.info(`Scheduler started — polling every ${minutes} minute(s)`);
  timer = setInterval(() => {
    runSync({ source: 'scheduled' }).catch((e) => logger.error('Scheduled sync error: ' + e.message));
  }, intervalMs);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

// Call after config changes so a new poll interval takes effect.
function restart() {
  start();
}

module.exports = { start, stop, restart };
