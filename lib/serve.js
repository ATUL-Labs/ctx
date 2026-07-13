'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openDb, refresh, ftsRows, shouldRefresh, markRefreshed } = require('./indexer');
const { startWatcher } = require('./watcher');
const consoleErrors = require('./console-errors');

const PAGE_RE = /^[a-z0-9-]+\.md$/;
const REFRESH_MS = 30000;

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function listMd(dir) { try { return fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort(); } catch { return []; } }

function overview(db, root, refreshedAt) {
  const lex = path.join(root, '.lex');
  const audit = (readSafe(path.join(lex, 'audit.log')) || '').trim();
  let version = '';
  try { version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch {}
  return {
    project: path.basename(root),
    version,
    refreshedAt,
    status: readSafe(path.join(lex, 'status.md')),
    wip: readSafe(path.join(lex, 'wip.md')),
    pages: listMd(path.join(lex, 'pages')).filter(f => PAGE_RE.test(f)),
    sessions: listMd(path.join(lex, 'sessions')).reverse().slice(0, 10),
    audit: audit ? audit.split('\n').slice(-20) : [],
    index: {
      files: db.prepare("SELECT COUNT(*) c FROM files WHERE path NOT LIKE '.lex/%'").get().c,
      symbols: db.prepare('SELECT COUNT(*) c FROM symbols').get().c,
      links: db.prepare('SELECT COUNT(*) c FROM links').get().c,
    },
  };
}

function send(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// stack token (matched against manifest text) -> MCP suggestion
const MCP_MAP = [
  ['"laravel/framework"', 'Laravel', 'laravel-boost plugin (artisan, tinker, docs)'],
  ['"next"', 'Next.js', 'Playwright MCP (E2E) + Vercel MCP (deploys)'],
  ['"react"', 'React', 'shadcn/ui MCP (components) + Playwright MCP (E2E)'],
  ['"tailwindcss"', 'Tailwind', 'shadcn/ui MCP (component search)'],
  ['snowflake', 'Snowflake', 'Snowflake MCP (warehouse queries)'],
  ['"stripe"', 'Stripe', 'Stripe MCP (payments API)'],
  ['stripe/stripe-php', 'Stripe', 'Stripe MCP (payments API)'],
  ['"redis"', 'Redis', 'Redis MCP'],
  ['predis/predis', 'Redis', 'Redis MCP'],
  ['psycopg', 'PostgreSQL', 'Postgres MCP (schema + queries)'],
  ['"pg"', 'PostgreSQL', 'Postgres MCP (schema + queries)'],
  ['mysql', 'MySQL', 'MySQL MCP (schema + queries)'],
  ['sqlite', 'SQLite', 'SQLite MCP (schema + queries)'],
  ['fastapi', 'FastAPI', 'mcp-run-python (sandboxed execution)'],
  ['django', 'Django', 'mcp-run-python (sandboxed execution)'],
  ['flask', 'Flask', 'mcp-run-python (sandboxed execution)'],
  ['supabase', 'Supabase', 'Supabase MCP'],
  ['sentry', 'Sentry', 'Sentry MCP (error triage)'],
  ['inertiajs', 'Inertia.js', 'Playwright MCP (E2E through the SPA layer)'],
];

const MANIFEST_NAMES = new Set(['package.json', 'composer.json', 'requirements.txt', 'pyproject.toml', 'go.mod']);
const MANIFEST_SKIP = new Set(['node_modules', 'vendor', '.git', 'dist', 'build', 'storage']);

// manifests (.json/.txt/.toml) are deliberately not indexed; scan disk two levels deep
function findManifests(root) {
  const found = [];
  let hasDocker = false;
  const scan = (dir, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isFile()) {
        if (MANIFEST_NAMES.has(e.name)) found.push(path.join(dir, e.name));
        if (e.name === 'Dockerfile' || e.name.startsWith('docker-compose')) hasDocker = true;
      } else if (e.isDirectory() && depth < 2 && !MANIFEST_SKIP.has(e.name) && !e.name.startsWith('.')) {
        scan(path.join(dir, e.name), depth + 1);
      }
    }
  };
  scan(root, 0);
  return { found, hasDocker };
}

// names of MCP servers already configured (project .mcp.json + user ~/.claude.json)
function configuredMcpNames(root) {
  const names = [];
  const collect = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if (obj.mcpServers) names.push(...Object.keys(obj.mcpServers));
    if (obj.projects) for (const k of Object.keys(obj.projects)) collect(obj.projects[k]);
  };
  for (const p of [path.join(root, '.mcp.json'), path.join(require('node:os').homedir(), '.claude.json')]) {
    try { collect(JSON.parse(readSafe(p) || '')); } catch {}
  }
  return names.map(n => n.toLowerCase());
}

function mcpSuggestions(root) {
  const { found, hasDocker } = findManifests(root);
  let text = '';
  for (const m of found) text += (readSafe(m) || '').toLowerCase() + '\n';
  const rows = [];
  const seen = new Set();
  for (const [token, tech, mcp] of MCP_MAP) {
    if (!seen.has(tech) && text.includes(token.toLowerCase())) {
      seen.add(tech);
      rows.push({ tech, mcp });
    }
  }
  if (hasDocker) rows.push({ tech: 'Docker', mcp: 'Docker MCP (containers, logs)' });
  if (fs.existsSync(path.join(root, '.github', 'workflows'))) {
    rows.push({ tech: 'GitHub Actions', mcp: 'GitHub MCP (PRs, issues, CI runs)' });
  }
  // drop suggestions the user already has connected
  const have = configuredMcpNames(root);
  return rows.filter(r => {
    const hay = (r.tech + ' ' + r.mcp).toLowerCase();
    return !have.some(n => n.length >= 3 && hay.includes(n.replace(/[-_]/g, ' ').split(' ')[0]));
  });
}

function createServer(root, opts) {
  if (!fs.existsSync(path.join(root, '.lex'))) {
    throw new Error('createServer requires a project root containing a .lex folder: ' + root);
  }
  const db = openDb(root);
  refresh(db, root);
  let last = Date.now();
  let watcher = null;
  if (opts && opts.watch) {
    watcher = startWatcher(db, root);
  }
  const server = http.createServer((req, res) => {
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host || '')) {
      return send(res, 403, { error: 'forbidden' });
    }
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(__dirname, '..', 'viewer.html'), 'utf8'));
      } else if (url.pathname === '/api/overview') {
        if (Date.now() - last > REFRESH_MS) { refresh(db, root); last = Date.now(); }
        send(res, 200, overview(db, root, last));
      } else if (url.pathname === '/api/page') {
        const name = url.searchParams.get('name') || '';
        if (!PAGE_RE.test(name)) return send(res, 400, { error: 'bad name' });
        const inPages = path.join(root, '.lex', 'pages', name);
        const text = readSafe(fs.existsSync(inPages) ? inPages : path.join(root, '.lex', name));
        if (text === null) return send(res, 404, { error: 'not found' });
        send(res, 200, { name, text });
      } else if (url.pathname === '/api/search') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return send(res, 200, { rows: [] });
        if (shouldRefresh(db)) { refresh(db, root); last = Date.now(); markRefreshed(db); }
        send(res, 200, { rows: ftsRows(db, q.split(/\s+/), 20, ['[[', ']]'], root) });
      } else if (url.pathname === '/api/cli') {
        const cmd = url.searchParams.get('cmd') || '';
        const arg = url.searchParams.get('arg') || '';
        if (cmd === 'search' && arg) {
          if (shouldRefresh(db)) { refresh(db, root); last = Date.now(); markRefreshed(db); }
          const parts = arg.split('\t');
          const searchTerms = parts[0].split(/\s+/).filter(Boolean);
          const scope = parts[1] || null;
          const rows = ftsRows(db, searchTerms, 10, undefined, root, scope);
          const lines = rows.map(r => `${r.path}:${r.line || 0}: ${r.snip.replace(/\s+/g, ' ')}`);
          if (!rows.length) lines.push('no matches');
          send(res, 200, { output: lines.join('\n') });
        } else if (cmd === 'symbols' && arg) {
          const rel = arg.replace(/\\/g, '/');
          const rows = db.prepare('SELECT line, kind, name FROM symbols WHERE path = ? ORDER BY line LIMIT 40').all(rel);
          const lines = rows.map(r => `${r.line} ${r.kind} ${r.name}`);
          if (!rows.length) lines.push('no symbols indexed for ' + rel);
          send(res, 200, { output: lines.join('\n') });
        } else if (cmd === 'ping') {
          send(res, 200, { output: 'pong', root });
        } else {
          send(res, 400, { error: 'bad cmd' });
        }
      } else if (url.pathname === '/api/links') {
        send(res, 200, { rows: db.prepare('SELECT side, method, url, path, line FROM links ORDER BY url, side LIMIT 500').all() });
      } else if (url.pathname === '/api/file') {
        const p = url.searchParams.get('path') || '';
        const row = db.prepare('SELECT path FROM files WHERE path = ?').get(p);
        if (!row) return send(res, 404, { error: 'not indexed' });
        const text = readSafe(path.join(root, row.path));
        if (text === null) return send(res, 404, { error: 'not found' });
        send(res, 200, { path: row.path, text });
      } else if (url.pathname === '/api/mcps') {
        send(res, 200, { rows: mcpSuggestions(root) });
      } else if (url.pathname === '/api/ls') {
        const dir = (url.searchParams.get('dir') || '').replace(/\\/g, '/').replace(/\/+$/, '');
        const prefix = dir ? dir + '/' : '';
        const rows = db.prepare("SELECT path FROM files WHERE path LIKE ? || '%' ORDER BY path LIMIT 2000").all(prefix);
        const dirs = new Set();
        const files = [];
        for (const r of rows) {
          const rest = r.path.slice(prefix.length);
          const slash = rest.indexOf('/');
          if (slash === -1) files.push(rest);
          else dirs.add(rest.slice(0, slash));
        }
        send(res, 200, { dirs: [...dirs].sort(), files });
      } else if (url.pathname === '/api/symbols') {
        const p = url.searchParams.get('path') || '';
        send(res, 200, { rows: db.prepare('SELECT line, kind, name FROM symbols WHERE path = ? ORDER BY line LIMIT 200').all(p) });
      } else if (url.pathname === '/api/activity') {
        const text = readSafe(path.join(root, '.lex', 'live.json'));
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch {}
        send(res, 200, data);
      } else if (url.pathname === '/api/schema') {
        const tableRows = db.prepare('SELECT DISTINCT name FROM schema_tables ORDER BY name').all();
        const tables = tableRows.map(t => ({
          name: t.name,
          columns: db.prepare('SELECT name, type, fk_table AS fkTable, fk_column AS fkColumn FROM schema_columns WHERE table_name = ? ORDER BY line').all(t.name),
        }));
        send(res, 200, { tables });
      } else if (url.pathname === '/api/session') {
        const name = url.searchParams.get('name') || '';
        if (!PAGE_RE.test(name)) return send(res, 400, { error: 'bad name' });
        const text = readSafe(path.join(root, '.lex', 'sessions', name));
        if (text === null) return send(res, 404, { error: 'not found' });
        send(res, 200, { name, text });
      } else if (url.pathname === '/api/error-capture.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(`(function(){var LEX_PORT=${JSON.stringify(server.address() ? server.address().port : 4747)};var q=[];var s=false;function f(){if(!q.length||s)return;s=true;var b=q.splice(0);fetch('http://127.0.0.1:'+LEX_PORT+'/api/console-errors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({errors:b})}).then(function(){s=false;f()}).catch(function(){s=false})}function r(t,d){q.push(Object.assign({type:t,url:location.href,ts:Date.now()},d));f()}var oe=console.error;console.error=function(){var a=Array.from(arguments);r('console.error',{message:a.map(function(x){return typeof x==='object'?JSON.stringify(x).substring(0,500):String(x)}).join(' ')});oe.apply(console,a)};var ow=console.warn;console.warn=function(){var a=Array.from(arguments);r('console.warn',{message:a.map(function(x){return typeof x==='object'?JSON.stringify(x).substring(0,500):String(x)}).join(' ')});ow.apply(console,a)};window.addEventListener('error',function(e){r('uncaught',{message:e.message,filename:e.filename,lineno:e.lineno,colno:e.colno,stack:e.error&&e.error.stack?e.error.stack.substring(0,1000):''})});window.addEventListener('unhandledrejection',function(e){r('unhandledrejection',{message:e.reason&&e.reason.message?e.reason.message:String(e.reason),stack:e.reason&&e.reason.stack?e.reason.stack.substring(0,1000):''})})();`);
      } else if (url.pathname === '/api/console-errors' && req.method === 'GET') {
        const since = parseInt(url.searchParams.get('since') || '0', 10);
        send(res, 200, { errors: consoleErrors.getErrors(since) });
      } else if (url.pathname === '/api/console-errors' && req.method === 'POST') {
        let body = '';
        req.on('data', (d) => body += d);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.errors && Array.isArray(data.errors)) {
              for (const e of data.errors) consoleErrors.addError(e);
              send(res, 200, { ok: true, count: data.errors.length });
            } else if (data.message) {
              consoleErrors.addError(data);
              send(res, 200, { ok: true });
            } else {
              send(res, 400, { error: 'bad body' });
            }
          } catch { send(res, 400, { error: 'bad json' }); }
        });
      } else if (url.pathname === '/api/console-errors/clear' && req.method === 'POST') {
        consoleErrors.clearErrors();
        send(res, 200, { ok: true });
      } else {
        send(res, 404, { error: 'not found' });
      }
    } catch {
      send(res, 500, { error: 'server error' });
    }
  });
  server._watcher = watcher;
  server._db = db;
  return server;
}

module.exports = { createServer, overview };
