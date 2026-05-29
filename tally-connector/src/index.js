#!/usr/bin/env node
/**
 * Atlas ⟷ TallyPrime connector — entry point.
 *
 * Starts the local control-panel UI and the 5-minute background poller.
 * Run with: npm start  (or: node src/index.js)
 */

const { startServer } = require('./server');
const scheduler = require('./scheduler');
const logger = require('./logger');
const { loadConfig } = require('./config');

function main() {
  const cfg = loadConfig();
  logger.info('Atlas Tally Connector starting…');
  startServer();
  scheduler.start();
  logger.info(`Open http://localhost:${cfg.uiPort} to configure and sync.`);
}

process.on('uncaughtException', (err) => logger.error('Uncaught: ' + err.stack));
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection: ' + (err && err.message)));

main();
