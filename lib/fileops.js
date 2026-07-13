'use strict';
const fs = require('node:fs');
const path = require('node:path');

/**
 * File operations that replace shelling out to PowerShell.
 * Agents avoid quoting hell, platform differences, and command-injection risks.
 */

function ls(root, dir) {
  const rel = (dir || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const prefix = rel ? rel + '/' : '';
  const db = require('./indexer').openDb(root);
  const rows = db.prepare("SELECT path FROM files WHERE path LIKE ? || '%' ORDER BY path LIMIT 2000").all(prefix);
  db.close();
  const dirs = new Set();
  const files = [];
  for (const r of rows) {
    const rest = r.path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if (slash === -1) files.push(rest);
    else dirs.add(rest.slice(0, slash));
  }
  return { dirs: [...dirs].sort(), files };
}

function read(root, relPath, startLine, endLine) {
  const full = path.isAbsolute(relPath) ? relPath : path.join(root, relPath);
  let content;
  try { content = fs.readFileSync(full, 'utf8'); } catch { return null; }
  const lines = content.split(/\r?\n/);
  const s = startLine ? Math.max(0, startLine - 1) : 0;
  const e = endLine ? Math.min(lines.length, endLine) : lines.length;
  const sliced = lines.slice(s, e);
  const numbered = sliced.map((line, i) => `${s + i + 1}\t${line}`).join('\n');
  return { content: numbered, totalLines: lines.length, shown: sliced.length, start: s + 1, end: e };
}

function write(root, relPath, content) {
  const full = path.isAbsolute(relPath) ? relPath : path.join(root, relPath);
  const dir = path.dirname(full);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(full, content);
  return { bytes: content.length, lines: content.split(/\r?\n/).length };
}

function trashDir(root) {
  const d = path.join(root, '.lex', 'trash');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function rm(root, relPath, opts) {
  const full = path.isAbsolute(relPath) ? relPath : path.join(root, relPath);
  if (!fs.existsSync(full)) return { ok: false, message: 'not found' };
  if (opts && opts.force) {
    fs.rmSync(full, { recursive: true });
    return { ok: true, message: 'permanently removed' };
  }
  // Safe delete: move to .lex/trash/ with timestamp
  const trash = trashDir(root);
  const ts = Date.now();
  const basename = path.basename(full);
  const dest = path.join(trash, ts + '_' + basename);
  fs.renameSync(full, dest);
  return { ok: true, message: 'moved to .lex/trash/' + path.basename(dest), trashPath: dest };
}

function mv(root, oldPath, newPath) {
  const old = path.isAbsolute(oldPath) ? oldPath : path.join(root, oldPath);
  const dst = path.isAbsolute(newPath) ? newPath : path.join(root, newPath);
  if (!fs.existsSync(old)) return { ok: false, message: 'source not found' };
  const dir = path.dirname(dst);
  fs.mkdirSync(dir, { recursive: true });
  // If destination exists, back it up to .lex/trash/ first
  let backup = null;
  if (fs.existsSync(dst)) {
    const trash = trashDir(root);
    const ts = Date.now();
    const basename = path.basename(dst);
    backup = path.join(trash, ts + '_' + basename);
    fs.renameSync(dst, backup);
  }
  fs.renameSync(old, dst);
  return { ok: true, from: oldPath, to: newPath, backup: backup ? '.lex/trash/' + path.basename(backup) : null };
}

function stat(root, relPath) {
  const full = path.isAbsolute(relPath) ? relPath : path.join(root, relPath);
  let st;
  try { st = fs.statSync(full); } catch { return null; }
  return {
    path: relPath,
    size: st.size,
    sizeKB: Math.round(st.size / 1024 * 10) / 10,
    mtime: st.mtime.toISOString(),
    isDir: st.isDirectory(),
    isFile: st.isFile(),
    ext: path.extname(relPath),
  };
}

module.exports = { ls, read, write, rm, mv, stat };
