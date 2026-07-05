'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createServer } = require('../lib/serve');

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxserve-'));
  fs.mkdirSync(path.join(root, '.ctx', 'pages'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, '.ctx', 'status.md'), 'phase: SERVE_STATUS_MARKER\n');
  fs.writeFileSync(path.join(root, '.ctx', 'wip.md'), '# WIP\n1. [x] done step\n2. [ ] SERVE_WIP_MARKER\n');
  fs.writeFileSync(path.join(root, '.ctx', 'pages', 'mistakes.md'), 'SERVE_PAGE_MARKER never again\n');
  fs.writeFileSync(path.join(root, '.ctx', 'audit.log'), '2026-07-02 10:00 | agent | platform | edit | src/a.js\n');
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'export function serveTestFn() {}\n');
  return root;
}

async function withServer(root, fn) {
  const server = createServer(root);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try { await fn(base); } finally { server.close(); }
}

test('overview returns live state and index stats', async () => {
  await withServer(makeProject(), async (base) => {
    const o = await (await fetch(base + '/api/overview')).json();
    assert.match(o.status, /SERVE_STATUS_MARKER/);
    assert.match(o.wip, /SERVE_WIP_MARKER/);
    assert.deepEqual(o.pages, ['mistakes.md']);
    assert.equal(o.audit.length, 1);
    assert.ok(o.index.files >= 2);
    assert.ok(o.index.symbols >= 1);
  });
});

test('page endpoint serves pages and blocks traversal', async () => {
  await withServer(makeProject(), async (base) => {
    const p = await (await fetch(base + '/api/page?name=mistakes.md')).json();
    assert.match(p.text, /SERVE_PAGE_MARKER/);
    assert.equal((await fetch(base + '/api/page?name=../../etc/passwd')).status, 400);
    assert.equal((await fetch(base + '/api/page?name=..%2Fstatus.md')).status, 400);
    assert.equal((await fetch(base + '/api/page?name=nope.md')).status, 404);
  });
});

test('search endpoint returns marked snippets', async () => {
  await withServer(makeProject(), async (base) => {
    const s = await (await fetch(base + '/api/search?q=serveTestFn')).json();
    assert.ok(s.rows.length >= 1);
    assert.match(s.rows[0].snip, /\[\[serveTestFn\]\]/);
  });
});

test('links endpoint and root html respond', async () => {
  await withServer(makeProject(), async (base) => {
    const l = await (await fetch(base + '/api/links')).json();
    assert.ok(Array.isArray(l.rows));
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /ctx viewer/i);
  });
});
