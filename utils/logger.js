// utils/logger.js
// Simple logger utility for the automation scripts (ESM compatible).
// Provides info, warn, error methods with timestamp and file logging.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, '..', '..', '.agent');
const LOG_FILE = path.join(LOG_DIR, 'bot.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function formatMessage(level, msg) {
  const timestamp = new Date().toISOString();
  return `${timestamp} [${level}] ${msg}`;
}

function logToFile(formatted) {
  try {
    fs.appendFileSync(LOG_FILE, formatted + '\n');
  } catch (e) {
    // If file write fails, fallback to console only.
  }
}

export function info(msg) {
  const formatted = formatMessage('INFO', msg);
  console.log(formatted);
  logToFile(formatted);
}

export function warn(msg) {
  const formatted = formatMessage('WARN', msg);
  console.warn(formatted);
  logToFile(formatted);
}

export function error(msg) {
  const formatted = formatMessage('ERROR', msg);
  console.error(formatted);
  logToFile(formatted);
}

export default { info, warn, error };
