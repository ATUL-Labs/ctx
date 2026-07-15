'use strict';

/**
 * Gateway - processes requests from .lex/in/ and returns JSON responses.
 *
 * This enables agents to use lex without running commands. The agent writes
 * a request to .lex/in/{name}.json using write_to_file (native tool),
 * the PostToolUse hook detects it, calls gateway.processRequest(), and injects
 * the result as additionalContext.
 *
 * Three input formats (parsed by the hook):
 *   1. Empty file = no-arg command (filename IS the command)
 *   2. Plain text = "cmd arg1 arg2" or "cmd|arg1|arg2"
 *   3. JSON = {"cmd": "search", "args": ["InputError"]}
 *
 * Commands: search, symbols, grep, read, patch, insert, rename, delete,
 *           batch, diff, errors, audit, undo, snapshot, refs, recent, links, guard
 *
 * Response format:
 *   {"ok": true, "output": "...text..."}
 *   {"ok": false, "error": "...message..."}
 */

const fs = require('node:fs');
const path = require('node:path');

function processRequest(root, request) {
  if (!request || !request.cmd) {
    return { ok: false, error: 'missing "cmd" field in request' };
  }

  const cmd = request.cmd;
  const args = request.args || [];

  try {
    // --- search ---
    if (cmd === 'search') {
      const { openDb, ftsRows, shouldRefresh, refresh } = require('../lib/indexer');
      const db = openDb(root);
      if (shouldRefresh(db)) refresh(db, root);
      const terms = Array.isArray(args) ? args : [String(args)];
      const rows = ftsRows(db, terms, 10);
      db.close();
      if (!rows.length) return { ok: true, output: 'no results' };
      const lines = rows.map(r => `${r.path}:${r.line || 0}: ${r.snip.replace(/\s+/g, ' ')}`);
      return { ok: true, output: lines.join('\n'), count: rows.length };
    }

    // --- symbols ---
    if (cmd === 'symbols') {
      const { openDb } = require('../lib/indexer');
      const db = openDb(root);
      const rel = (Array.isArray(args) ? args[0] : args).split(path.sep).join('/');
      const rows = db.prepare('SELECT line, kind, name FROM symbols WHERE path = ? ORDER BY line LIMIT 40').all(rel);
      db.close();
      if (!rows.length) return { ok: true, output: 'no symbols indexed for ' + rel };
      const lines = rows.map(r => `${r.line} ${r.kind} ${r.name}`);
      return { ok: true, output: lines.join('\n'), count: rows.length };
    }

    // --- grep ---
    if (cmd === 'grep') {
      const { openDb } = require('../lib/indexer');
      const db = openDb(root);
      const pattern = Array.isArray(args) ? args[0] : args;
      const fileFilter = Array.isArray(args) ? args[1] : null;
      const regex = new RegExp(pattern);
      let rows = db.prepare("SELECT path FROM files WHERE path NOT LIKE '.lex/%' ORDER BY path").all();
      if (fileFilter) {
        const filter = fileFilter.replace(/\\/g, '/');
        rows = rows.filter(r => r.path === filter || r.path.startsWith(filter + '/'));
      }
      const matches = [];
      for (const row of rows) {
        if (matches.length >= 20) break;
        const full = path.join(root, row.path);
        let content;
        try { content = fs.readFileSync(full, 'utf8'); } catch { continue; }
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            matches.push(`${row.path}:${i + 1}: ${lines[i].trim().substring(0, 120)}`);
            if (matches.length >= 20) break;
          }
        }
      }
      db.close();
      if (!matches.length) return { ok: true, output: 'no matches' };
      return { ok: true, output: matches.join('\n'), count: matches.length };
    }

    // --- read ---
    if (cmd === 'read') {
      const file = Array.isArray(args) ? args[0] : args;
      const range = Array.isArray(args) && args[1] ? args[1].split('-').map(Number) : [null, null];
      const full = path.isAbsolute(file) ? file : path.join(root, file);
      if (!fs.existsSync(full)) return { ok: false, error: 'file not found: ' + file };
      const content = fs.readFileSync(full, 'utf8');
      const lines = content.split(/\r?\n/);
      const start = range[0] ? Math.max(0, range[0] - 1) : 0;
      const end = range[1] ? Math.min(lines.length, range[1]) : lines.length;
      const result = [];
      for (let i = start; i < end; i++) {
        result.push(`${i + 1}\t${lines[i]}`);
      }
      return { ok: true, output: result.join('\n'), count: end - start };
    }

    // --- patch ---
    if (cmd === 'patch') {
      const { patch } = require('../lib/patch');
      const p = Array.isArray(args) ? args[0] : args;
      if (!p.file || !p.anchor) return { ok: false, error: 'patch requires file and anchor' };
      const filePath = path.isAbsolute(p.file) ? p.file : path.join(root, p.file);
      const r = patch(filePath, p.anchor, p.insertion || '', p.mode || 'after', { root, preview: p.preview, occurrence: p.occurrence, line: p.line });
      const parts = [];
      if (r.ok) {
        parts.push(`OK  ${p.file}  ${r.message}`);
        if (r.backup) parts.push(`backup: ${r.backup}`);
        if (r.diff) { parts.push('--- diff ---'); parts.push(r.diff); }
        if (r.context) { parts.push('--- context ---'); parts.push(r.context); }
      } else {
        parts.push(`FAIL  ${p.file}  ${r.message}`);
        if (r.context) { parts.push('--- context ---'); parts.push(r.context); }
        if (r.suggestion) parts.push('hint: ' + r.suggestion);
      }
      return { ok: r.ok, output: parts.join('\n'), backup: r.backup };
    }

    // --- rename ---
    if (cmd === 'rename') {
      const { renameAll } = require('../lib/patch');
      const p = Array.isArray(args) ? args[0] : args;

      // Multi-file mode: no file specified, use index to find all files
      if (!p.file) {
        if (!p.from || !p.to) return { ok: false, error: 'rename requires from and to (and optionally file for single-file mode)' };
        const { openDb } = require('../lib/indexer');
        let db;
        try { db = openDb(root); } catch { return { ok: false, error: 'index not found - run lex refresh first' }; }
        // Find all files containing the symbol via FTS
        const ftsRows = db.prepare("SELECT DISTINCT path FROM content_fts WHERE content_fts MATCH ? LIMIT 50").all('"' + p.from.replace(/"/g, '') + '"');
        // Also check symbol table for definitions
        const symRows = db.prepare("SELECT DISTINCT path FROM symbols WHERE name = ? LIMIT 50").all(p.from);
        db.close();
        const allPaths = [...new Set([...ftsRows.map(r => r.path), ...symRows.map(r => r.path)])];
        if (!allPaths.length) return { ok: false, error: `symbol "${p.from}" not found in any indexed file` };

        const results = [];
        let totalRenamed = 0;
        let failed = 0;
        for (const relPath of allPaths) {
          const filePath = path.join(root, relPath);
          if (!fs.existsSync(filePath)) continue;
          const r = renameAll(filePath, p.from, p.to, { root, preview: p.preview });
          if (r.ok) {
            totalRenamed += r.matches ? r.matches.length : 0;
            results.push(`  ${relPath}: ${r.matches.length} occurrences (lines ${r.matches.map(m => m.line).join(',')})`);
          } else {
            failed++;
            results.push(`  ${relPath}: SKIP - ${r.message}`);
          }
        }
        const parts = [];
        parts.push(`renamed "${p.from}" -> "${p.to}" in ${allPaths.length - failed} files (${totalRenamed} total occurrences)`);
        parts.push(...results);
        return { ok: true, output: parts.join('\n'), filesChanged: allPaths.length - failed, totalRenamed };
      }

      // Single-file mode
      if (!p.from || !p.to) return { ok: false, error: 'rename requires file, from, and to' };
      const filePath = path.isAbsolute(p.file) ? p.file : path.join(root, p.file);
      const r = renameAll(filePath, p.from, p.to, { root, preview: p.preview });
      const parts = [];
      if (r.ok) {
        parts.push(`OK  ${p.file}  ${r.message}`);
        if (r.backup) parts.push(`backup: ${r.backup}`);
        if (r.matches) parts.push(`lines: ${r.matches.map(m => m.line).join(', ')}`);
        if (r.diff) { parts.push('--- diff ---'); parts.push(r.diff); }
        if (r.context) { parts.push('--- context ---'); parts.push(r.context); }
      } else {
        parts.push(`FAIL  ${p.file}  ${r.message}`);
      }
      return { ok: r.ok, output: parts.join('\n'), backup: r.backup };
    }

    // --- undo ---
    if (cmd === 'undo') {
      const trashDir = path.join(root, '.lex', 'trash');
      if (!fs.existsSync(trashDir)) return { ok: false, error: 'no backups found' };
      const backups = fs.readdirSync(trashDir)
        .filter(f => !f.endsWith('.json'))
        .map(f => ({ name: f, mtime: fs.statSync(path.join(trashDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      if (!backups.length) return { ok: false, error: 'no backups found' };
      if (Array.isArray(args) && args[0] === '--list') {
        const lines = backups.slice(0, 10).map(b => `${b.name} -> ${b.name.replace(/^\d+_/, '')}`);
        return { ok: true, output: lines.join('\n') };
      }
      const latest = backups[0];
      const origRel = latest.name.replace(/^\d+_/, '').replace(/__/g, '/');
      fs.copyFileSync(path.join(trashDir, latest.name), path.join(root, origRel));
      fs.unlinkSync(path.join(trashDir, latest.name));
      return { ok: true, output: `restored ${origRel} from .lex/trash/${latest.name}` };
    }

    // --- snapshot ---
    if (cmd === 'snapshot') {
      const action = (Array.isArray(args) ? args[0] : args) || 'save';
      const snapDir = path.join(root, '.lex', 'snapshots');

      if (action === 'save') {
        const ts = Date.now();
        const dir = path.join(snapDir, String(ts));
        fs.mkdirSync(dir, { recursive: true });
        const files = Array.isArray(args) ? args.slice(1) : [];
        let saved = 0;
        for (const f of files) {
          const full = path.isAbsolute(f) ? f : path.join(root, f);
          if (fs.existsSync(full) && fs.statSync(full).isFile()) {
            const rel = path.relative(root, full).replace(/\\/g, '/');
            fs.copyFileSync(full, path.join(dir, rel.replace(/\//g, '__')));
            saved++;
          }
        }
        fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ ts, files: files.map(f => path.relative(root, path.isAbsolute(f) ? f : path.join(root, f)).replace(/\\/g, '/')) }));
        return { ok: true, output: `snapshot saved: ${saved} files -> .lex/snapshots/${ts}` };
      }

      if (action === 'restore') {
        const snaps = fs.existsSync(snapDir) ? fs.readdirSync(snapDir).sort((a, b) => Number(b) - Number(a)) : [];
        if (!snaps.length) return { ok: false, error: 'no snapshots found' };
        const snapId = (Array.isArray(args) ? args[1] : null) || snaps[0];
        const dir = path.join(snapDir, snapId);
        if (!fs.existsSync(dir)) return { ok: false, error: 'snapshot not found: ' + snapId };
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
        let restored = 0;
        for (const f of manifest.files) {
          const src = path.join(dir, f.replace(/\//g, '__'));
          const dst = path.join(root, f);
          if (fs.existsSync(src)) {
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
            restored++;
          }
        }
        return { ok: true, output: `restored ${restored} files from snapshot ${snapId}` };
      }

      if (action === 'list') {
        const snaps = fs.existsSync(snapDir) ? fs.readdirSync(snapDir).sort((a, b) => Number(b) - Number(a)) : [];
        if (!snaps.length) return { ok: true, output: '(no snapshots)' };
        const lines = snaps.slice(0, 10).map(s => {
          try { return `${s} (${JSON.parse(fs.readFileSync(path.join(snapDir, s, 'manifest.json'), 'utf8')).files.length} files)`; }
          catch { return `${s} (? files)`; }
        });
        return { ok: true, output: lines.join('\n') };
      }

      return { ok: false, error: 'unknown snapshot action: ' + action };
    }

    // --- refs ---
    if (cmd === 'refs') {
      const { openDb } = require('../lib/indexer');
      const db = openDb(root);
      const symbol = Array.isArray(args) ? args[0] : args;
      const rows = db.prepare('SELECT path, name, kind, line FROM symbols WHERE name = ? ORDER BY path LIMIT 50').all(symbol);
      const ftsRows = db.prepare("SELECT path, snippet(content_fts, 1, '[[', ']]', '...', 6) AS snip FROM content_fts WHERE content_fts MATCH ? ORDER BY rank LIMIT 30").all('"' + symbol.replace(/"/g, '') + '"');
      db.close();
      const parts = [];
      if (rows.length) {
        parts.push('definitions:');
        for (const r of rows) parts.push('  ' + r.path + ':' + r.line + ' ' + r.kind + ' ' + r.name);
      }
      const defPaths = new Set(rows.map(r => r.path));
      const refMap = new Map();
      for (const r of ftsRows) { if (!refMap.has(r.path)) refMap.set(r.path, r.snip); }
      const refs = [...refMap.entries()].filter(([p]) => !defPaths.has(p));
      if (refs.length) {
        parts.push('references:');
        for (const [p, snip] of refs) parts.push('  ' + p + ': ' + snip.replace(/\s+/g, ' '));
      }
      if (!parts.length) return { ok: true, output: 'no references found for ' + symbol };
      return { ok: true, output: parts.join('\n') };
    }

    // --- recent ---
    if (cmd === 'recent') {
      const limit = (Array.isArray(args) ? args[0] : args) || 20;
      const auditPath = path.join(root, '.lex', 'audit.log');
      let lines = [];
      try { lines = fs.readFileSync(auditPath, 'utf8').trim().split('\n'); } catch {}
      if (!lines.length || !lines[0]) return { ok: true, output: 'no recent activity' };
      const seen = new Set();
      const results = [];
      for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
        const parts = lines[i].split('|').map(s => s.trim());
        if (parts.length < 5) continue;
        const file = parts[4];
        if (seen.has(file)) continue;
        seen.add(file);
        results.push(`${parts[0]}  ${parts[3].padEnd(8)} ${file}`);
      }
      return { ok: true, output: results.join('\n') };
    }

    // --- links (route + consumer relationships) ---
    if (cmd === 'links') {
      const { openDb } = require('../lib/indexer');
      const { normalizeUrl } = require('../lib/extract');
      let db;
      try { db = openDb(root); } catch { return { ok: false, error: 'index not found - run lex refresh first' }; }
      const urlArg = Array.isArray(args) ? args[0] : args;
      if (!urlArg) {
        const all = db.prepare('SELECT side, method, url, path, line FROM links ORDER BY url, side LIMIT 50').all();
        db.close();
        if (!all.length) return { ok: true, output: 'no links indexed' };
        const lines = all.map(r => `${r.side} ${r.method || '-'} ${r.url} ${r.path}:${r.line}`);
        return { ok: true, output: lines.join('\n'), count: all.length };
      }
      const url = normalizeUrl(urlArg.startsWith('/') ? urlArg : '/' + urlArg);
      const rows = db.prepare('SELECT side, method, url, path, line FROM links WHERE url = ? OR url LIKE ? ORDER BY side, path LIMIT 40').all(url, url + '/%');
      db.close();
      if (!rows.length) return { ok: true, output: 'no links match ' + url };
      const lines = rows.map(r => `${r.side} ${r.method || '-'} ${r.url} ${r.path}:${r.line}`);
      return { ok: true, output: lines.join('\n'), count: rows.length };
    }

    // --- delete (safe delete via fileops) ---
    if (cmd === 'delete') {
      const { rm } = require('../lib/fileops');
      const fileArg = Array.isArray(args) ? args[0] : args;
      if (!fileArg) return { ok: false, error: 'delete requires a file path' };
      const r = rm(root, fileArg);
      if (!r.ok) return { ok: false, error: r.message };
      return { ok: true, output: `deleted ${fileArg} -> ${r.message}` };
    }

    // --- batch ---
    if (cmd === 'batch') {
      const commands = Array.isArray(args) ? args : [args];
      if (!commands.length) return { ok: false, error: 'batch requires an array of commands' };
      const results = [];
      let allOk = true;
      for (const subReq of commands) {
        if (!subReq || !subReq.cmd) { results.push({ ok: false, error: 'missing cmd in batch item' }); allOk = false; continue; }
        const subResult = processRequest(root, subReq);
        results.push({
          cmd: subReq.cmd,
          ok: subResult.ok,
          output: subResult.ok ? subResult.output : (subResult.error || subResult.output || 'failed'),
        });
        if (!subResult.ok) allOk = false;
      }
      const summary = results.map((r, i) => 
        `[${i + 1}] ${r.cmd}: ${r.ok ? 'OK' : 'FAIL'}\n${r.output}`
      ).join('\n---\n');
      return { ok: allOk, output: summary, results };
    }

    // --- diff ---
    if (cmd === 'diff') {
      const { openDb, walk } = require('../lib/indexer');
      let db;
      try { db = openDb(root); } catch { return { ok: false, error: 'index not found - run lex refresh first' }; }
      const indexedFiles = db.prepare('SELECT path, mtime_ms, size FROM files').all();
      const indexedMap = new Map();
      for (const f of indexedFiles) indexedMap.set(f.path, f);
      const onDisk = new Set();
      const diskFiles = walk(root);
      const modified = [];
      const added = [];
      const deleted = [];
      // First pass: detect modified/added without loading FTS content
      for (const rel of diskFiles) {
        onDisk.add(rel);
        let st;
        try { st = fs.statSync(path.join(root, rel)); } catch { continue; }
        const row = indexedMap.get(rel);
        if (!row) {
          added.push(rel);
        } else if (row.mtime_ms !== Math.trunc(st.mtimeMs) || row.size !== st.size) {
          modified.push({ path: rel, mtime: st.mtimeMs, size: st.size });
        }
      }
      for (const f of indexedFiles) {
        if (!onDisk.has(f.path) && !f.path.startsWith('.lex/')) deleted.push(f.path);
      }
      // Second pass: only load FTS content for modified files
      const modifiedWithChanges = [];
      if (modified.length) {
        const placeholders = modified.map(() => '?').join(',');
        const contentRows = db.prepare(`SELECT path, text FROM content_fts WHERE path IN (${placeholders})`).all(...modified.map(m => m.path));
        const contentMap = new Map();
        for (const r of contentRows) contentMap.set(r.path, r.text);
        for (const m of modified) {
          let addedLines = 0, removedLines = 0;
          try {
            const newContent = fs.readFileSync(path.join(root, m.path), 'utf8');
            const oldLines = (contentMap.get(m.path) || '').split(/\r?\n/);
            const newLines = newContent.split(/\r?\n/);
            let prefix = 0;
            while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
            let suffix = 0;
            while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;
            removedLines = oldLines.length - prefix - suffix;
            addedLines = newLines.length - prefix - suffix;
          } catch {}
          modifiedWithChanges.push({ path: m.path, added: addedLines, removed: removedLines });
        }
      }
      db.close();
      if (!modifiedWithChanges.length && !added.length && !deleted.length) {
        return { ok: true, output: 'no changes - index is in sync' };
      }
      const lines = [];
      let totalAdd = 0, totalRem = 0;
      for (const m of modifiedWithChanges) {
        const sign = m.added > m.removed ? '+' : m.added < m.removed ? '-' : '~';
        lines.push(`M  ${m.path}  ${sign}${m.added}+${m.removed}-`);
        totalAdd += m.added;
        totalRem += m.removed;
      }
      for (const f of added) lines.push(`A  ${f}`);
      for (const f of deleted) lines.push(`D  ${f}`);
      lines.push(`${modifiedWithChanges.length}M ${added.length}A ${deleted.length}D  ${totalAdd}+ ${totalRem}-`);
      return { ok: true, output: lines.join('\n'), modified: modifiedWithChanges.length, added: added.length, deleted: deleted.length };
    }

    // --- insert (shorthand for patch after) ---
    if (cmd === 'insert') {
      const { patch } = require('../lib/patch');
      const p = Array.isArray(args) ? args[0] : args;
      if (!p.file || (!p.after && !p.before)) return { ok: false, error: 'insert requires file and after/before anchor' };
      const anchor = p.after || p.before;
      const mode = p.after ? 'after' : 'before';
      const filePath = path.isAbsolute(p.file) ? p.file : path.join(root, p.file);
      const r = patch(filePath, anchor, p.line || p.insertion || '', mode, { root, preview: p.preview, occurrence: p.occurrence, line: p.lineNum });
      const parts = [];
      if (r.ok) {
        parts.push(`OK  ${p.file}  ${r.message}`);
        if (r.backup) parts.push(`backup: ${r.backup}`);
        if (r.diff) { parts.push('--- diff ---'); parts.push(r.diff); }
        if (r.context) { parts.push('--- context ---'); parts.push(r.context); }
      } else {
        parts.push(`FAIL  ${p.file}  ${r.message}`);
        if (r.context) { parts.push('--- context ---'); parts.push(r.context); }
        if (r.suggestion) parts.push('hint: ' + r.suggestion);
      }
      return { ok: r.ok, output: parts.join('\n'), backup: r.backup };
    }

    // --- errors (console + app errors from lex serve) ---
    if (cmd === 'errors') {
      const { execFileSync } = require('child_process');
      const fetchScript = path.join(__dirname, 'fetch.js');
      const nodeBin = process.execPath;
      let ports = [4747, 4748, 4749, 4750, 4751, 4752, 4753, 4754, 4755];
      try {
        const info = JSON.parse(fs.readFileSync(path.join(root, '.lex', 'server.json'), 'utf8'));
        if (info.port) ports = [info.port, ...ports.filter(p => p !== info.port)];
      } catch {}
      let consoleResult = null;
      let appResult = null;
      for (const port of ports) {
        try {
          const pingOut = execFileSync(nodeBin, [fetchScript, String(port), '/api/cli?cmd=ping', '200'], { timeout: 1000, cwd: root, encoding: 'utf8' });
          const ping = JSON.parse(pingOut);
          if (ping.output !== 'pong' || !ping.root || path.resolve(ping.root) !== path.resolve(root)) continue;
          try {
            const errOut = execFileSync(nodeBin, [fetchScript, String(port), '/api/console-errors', '500'], { timeout: 2000, cwd: root, encoding: 'utf8' });
            consoleResult = JSON.parse(errOut);
          } catch {}
          try {
            const appOut = execFileSync(nodeBin, [fetchScript, String(port), '/api/app-errors', '500'], { timeout: 2000, cwd: root, encoding: 'utf8' });
            appResult = JSON.parse(appOut);
          } catch {}
          break;
        } catch {}
      }
      if (!consoleResult && !appResult) return { ok: false, error: 'no lex server running - start one with: lex serve or lex watch' };
      const lines = [];
      const consoleErrs = (consoleResult && consoleResult.errors) || [];
      if (consoleErrs.length) {
        lines.push(`console errors (${consoleErrs.length}):`);
        for (const e of consoleErrs) {
          lines.push(`  [${e.type || 'error'}] ${e.message || ''}${e.filename ? ' (' + e.filename + ':' + (e.lineno || 0) + ')' : ''}`);
          if (e.stack) lines.push('    ' + e.stack.split('\n').slice(0, 3).join('\n    '));
        }
      } else {
        lines.push('no console errors captured');
      }
      const appErrs = (appResult && appResult.errors) || [];
      if (appErrs.length) {
        lines.push(`\napp errors (${appErrs.length}):`);
        for (const e of appErrs) {
          lines.push(`  [${e.type || 'app-error'}] ${e.message || ''}${e.command ? ' (cmd: ' + e.command + ')' : ''}${e.exitCode !== undefined ? ' exit: ' + e.exitCode : ''}`);
        }
      } else {
        lines.push('no app errors captured');
      }
      return { ok: true, output: lines.join('\n'), count: consoleErrs.length + appErrs.length };
    }

    // --- guard ---
    if (cmd === 'guard') {
      // Simple inline guard: check for common secret patterns
      const patterns = [
        { re: /(?:api[_-]?key|apikey|secret|token|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/i, msg: 'possible hardcoded secret' },
        { re: /AKIA[0-9A-Z]{16}/, msg: 'AWS access key' },
        { re: /ghp_[A-Za-z0-9]{36}/, msg: 'GitHub personal access token' },
        { re: /sk-[A-Za-z0-9]{20,}/, msg: 'OpenAI API key' },
      ];
      const { walk } = require('../lib/indexer');
      const files = walk(root);
      const findings = [];
      for (const f of files) {
        if (f.startsWith('.lex/') || f.startsWith('node_modules/')) continue;
        let content;
        try { content = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          for (const p of patterns) {
            if (p.re.test(lines[i])) {
              findings.push(`[CRITICAL] ${f}:${i + 1} - ${p.msg}`);
            }
          }
        }
      }
      if (!findings.length) return { ok: true, output: 'no issues found' };
      return { ok: true, output: findings.join('\n'), count: findings.length };
    }

    // --- audit (headless browser console + network errors) ---
    if (cmd === 'audit') {
      const { execFileSync } = require('child_process');
      const nodeBin = process.execPath;
      const lexBin = path.join(__dirname, '..', 'bin', 'lex.js');
      const cliArgs = ['audit'];
      // Accept URLs as array or space-separated string
      const urls = Array.isArray(args) ? args : (typeof args === 'string' ? args.split(/\s+/).filter(Boolean) : []);
      for (const u of urls) {
        if (typeof u === 'string' && u.startsWith('http')) cliArgs.push(u);
      }
      cliArgs.push('--json');
      try {
        const out = execFileSync(nodeBin, [lexBin, ...cliArgs], {
          cwd: root,
          timeout: 30000,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const result = JSON.parse(out);
        if (!result.ok) return { ok: false, error: result.error };
        const { formatAuditResult } = require('./browser-audit');
        return { ok: true, output: formatAuditResult(result), count: result.totalErrors + result.totalNetworkErrors };
      } catch (e) {
        return { ok: false, error: 'audit failed: ' + (e.message || String(e)).substring(0, 200) };
      }
    }

    return { ok: false, error: 'unknown command: ' + cmd + '. Available: search, symbols, grep, read, patch, insert, rename, delete, batch, diff, errors, audit, undo, snapshot, refs, recent, links, guard' };

  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { processRequest };
