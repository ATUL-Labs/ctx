'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { updateFile, isTextFile } = require('./extract');

const DEBOUNCE_MS = 300;

function startWatcher(db, root) {
  const pending = new Map();
  let timer = null;

  function flush() {
    timer = null;
    for (const [rel] of pending) {
      try {
        updateFile(db, root, rel);
      } catch {}
    }
    pending.clear();
  }

  function schedule(rel) {
    pending.set(rel, true);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  }

  let watcher;
  try {
    watcher = fs.watch(root, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const rel = String(filename).replace(/\\/g, '/');
      if (rel.startsWith('.lex/')) return;
      if (rel.startsWith('node_modules/')) return;
      if (rel.startsWith('.git/')) return;
      if (!isTextFile(rel)) return;
      schedule(rel);
    });
  } catch {
    return null;
  }

  return watcher;
}

module.exports = { startWatcher };
