'use strict';
const fs = require('node:fs');
const path = require('node:path');

const CHARS_PER_TOKEN = 4;
const LEDGER_FILE = 'token-ledger.json';

function ledgerPath(root) {
  return path.join(root, '.lex', LEDGER_FILE);
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function loadLedger(root) {
  try {
    return JSON.parse(fs.readFileSync(ledgerPath(root), 'utf8'));
  } catch {
    return { session_start: null, entries: [] };
  }
}

function saveLedger(root, ledger) {
  try { fs.writeFileSync(ledgerPath(root), JSON.stringify(ledger)); } catch {}
}

function resetLedger(root) {
  const ledger = { session_start: new Date().toISOString(), entries: [] };
  saveLedger(root, ledger);
  return ledger;
}

function addEntry(root, entry) {
  const ledger = loadLedger(root);
  ledger.entries.push({ ...entry, ts: Date.now() });
  saveLedger(root, ledger);
}

function trackInjection(root, source, text) {
  const tokens = estimateTokens(text);
  addEntry(root, { type: 'injection', source, bytes: text.length, tokens });
  return tokens;
}

function trackRead(root, filePath, content) {
  const tokens = estimateTokens(content);
  const rel = path.relative(root, filePath).split(path.sep).join('/');
  addEntry(root, { type: 'read', file: rel, bytes: content.length, tokens });
  return tokens;
}

function trackWrite(root, filePath, content) {
  const tokens = estimateTokens(content);
  const rel = path.relative(root, filePath).split(path.sep).join('/');
  addEntry(root, { type: 'write', file: rel, bytes: content.length, tokens });
  return tokens;
}

function trackCommand(root, command, output) {
  const tokens = estimateTokens(output);
  addEntry(root, { type: 'command', command: command.substring(0, 100), bytes: output.length, tokens });
  return tokens;
}

function trackSearch(root, query, results) {
  const tokens = estimateTokens(results);
  addEntry(root, { type: 'search', query, bytes: results.length, tokens });
  return tokens;
}

function summarize(root) {
  const ledger = loadLedger(root);
  const entries = ledger.entries;

  const byType = {};
  let totalTokens = 0;
  let totalBytes = 0;
  const filesRead = new Set();
  const filesWritten = new Set();
  const commands = [];
  const searches = [];

  for (const e of entries) {
    byType[e.type] = byType[e.type] || { count: 0, tokens: 0, bytes: 0 };
    byType[e.type].count++;
    byType[e.type].tokens += e.tokens;
    byType[e.type].bytes += e.bytes;
    totalTokens += e.tokens;
    totalBytes += e.bytes;

    if (e.type === 'read' && e.file) filesRead.add(e.file);
    if (e.type === 'write' && e.file) filesWritten.add(e.file);
    if (e.type === 'command') commands.push(e.command);
    if (e.type === 'search') searches.push(e.query);
  }

  const inputTokens = (byType.injection?.tokens || 0) + (byType.read?.tokens || 0) + (byType.command?.tokens || 0) + (byType.search?.tokens || 0);
  const outputTokens = byType.write?.tokens || 0;

  return {
    session_start: ledger.session_start,
    total_entries: entries.length,
    total_tokens: totalTokens,
    total_bytes: totalBytes,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    by_type: byType,
    files_read: [...filesRead],
    files_written: [...filesWritten],
    commands: commands,
    searches: searches,
  };
}

module.exports = {
  estimateTokens,
  loadLedger,
  saveLedger,
  resetLedger,
  trackInjection,
  trackRead,
  trackWrite,
  trackCommand,
  trackSearch,
  summarize,
  ledgerPath,
};
