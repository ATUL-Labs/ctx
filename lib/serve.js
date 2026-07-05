'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openDb, refresh, ftsRows } = require('./indexer');

const PAGE_RE = /^[a-z0-9-]+\.md$/;
const REFRESH_MS = 30000;

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function listMd(dir) { try { return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort(); } catch { return []; } }

function overview(db, root) {
  const ctx = path.join(root, '.ctx');
  const audit = (readSafe(path.join(ctx, 'audit.log')) || '').trim();
  let version = '';
  try { version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch {}
  return {
    project: path.basename(root),
    version,
    status: readSafe(path.join(ctx, 'status.md')),
    wip: readSafe(path.join(ctx, 'wip.md')),
    pages: listMd(path.join(ctx, 'pages')),
    sessions: listMd(path.join(ctx, 'sessions')).reverse().slice(0, 10),
    audit: audit ? audit.split('\n').slice(-20) : [],
    index: {
      files: db.prepare('SELECT COUNT(*) c FROM files').get().c,
      symbols: db.prepare('SELECT COUNT(*) c FROM symbols').get().c,
      links: db.prepare('SELECT COUNT(*) c FROM links').get().c,
    },
  };
}

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function createServer(root) {
  if (!fs.existsSync(path.join(root, '.ctx'))) {
    throw new Error('createServer requires a project root containing a .ctx folder: ' + root);
  }
  const db = openDb(root);
  refresh(db, root);
  let last = Date.now();
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, '..', 'viewer.html'), 'utf8'));
      } else if (url.pathname === '/api/overview') {
        if (Date.now() - last > REFRESH_MS) { refresh(db, root); last = Date.now(); }
        send(res, 200, overview(db, root));
      } else if (url.pathname === '/api/page') {
        const name = url.searchParams.get('name') || '';
        if (!PAGE_RE.test(name)) return send(res, 400, { error: 'bad name' });
        const inPages = path.join(root, '.ctx', 'pages', name);
        const text = readSafe(fs.existsSync(inPages) ? inPages : path.join(root, '.ctx', name));
        if (text === null) return send(res, 404, { error: 'not found' });
        send(res, 200, { name, text });
      } else if (url.pathname === '/api/search') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return send(res, 200, { rows: [] });
        refresh(db, root); last = Date.now();
        send(res, 200, { rows: ftsRows(db, q.split(/\s+/), 20, ['[[', ']]']) });
      } else if (url.pathname === '/api/links') {
        send(res, 200, { rows: db.prepare('SELECT side, method, url, path, line FROM links ORDER BY url, side LIMIT 500').all() });
      } else {
        send(res, 404, { error: 'not found' });
      }
    } catch {
      send(res, 500, { error: 'server error' });
    }
  });
}

module.exports = { createServer, overview };
