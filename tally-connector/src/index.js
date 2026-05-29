#!/usr/bin/env node
/**
 * Atlas ⟷ TallyPrime connector — entry point.
 *
 *   node src/index.js              start the UI + 5-minute poller (normal mode)
 *   node src/index.js --dry-run    fetch + parse all modules, print JSON, exit
 *                                  (no Atlas send, no state changes)
 *   node src/index.js --benchmark  measure per-module request cost, exit
 *                                  (add --runs=N to average)
 */

const { startServer } = require('./server');
const scheduler = require('./scheduler');
const logger = require('./logger');
const { loadConfig } = require('./config');

const args = process.argv.slice(2);

async function dryRun() {
  const { runSync } = require('./sync');
  const result = await runSync({ dryRun: true });
  if (!result.ok) {
    console.error('Dry run failed:', result.error);
    process.exit(1);
  }
  // The parsed payload is the whole point — print it for inspection.
  console.log(JSON.stringify(result.payload, null, 2));
  process.exit(0);
}

async function benchmark() {
  await require('./benchmark').run();
  process.exit(0);
}

function start() {
  const cfg = loadConfig();
  logger.info('Atlas Tally Connector starting…');
  startServer();
  scheduler.start();
  logger.info(`Open http://localhost:${cfg.uiPort} to configure and sync.`);
}

process.on('uncaughtException', (err) => logger.error('Uncaught: ' + err.stack));
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection: ' + (err && err.message)));

if (args.includes('--dry-run')) dryRun();
else if (args.includes('--benchmark')) benchmark();
else start();
