'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { findBrowser } = require('../lib/browser-detect');
const { formatAuditResult, loadAuditConfig } = require('../lib/browser-audit');
const gateway = require('../lib/gateway');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');

test('browser-detect: findBrowser returns an object or null', () => {
  const b = findBrowser();
  if (b) {
    assert.ok(typeof b === 'object');
    assert.ok(typeof b.path === 'string');
    assert.ok(typeof b.name === 'string');
    assert.ok(b.path.length > 0);
  } else {
    // No browser found is acceptable on CI
    assert.ok(b === null);
  }
});

test('browser-detect: findBrowser returns consistent results', () => {
  const b1 = findBrowser();
  const b2 = findBrowser();
  if (b1 && b2) {
    assert.strictEqual(b1.path, b2.path);
    assert.strictEqual(b1.name, b2.name);
  }
});

test('browser-audit: formatAuditResult handles failed audit', () => {
  const result = { ok: false, error: 'No browser found', results: [] };
  const out = formatAuditResult(result);
  assert.ok(out.includes('FAILED'));
  assert.ok(out.includes('No browser found'));
});

test('browser-audit: formatAuditResult handles clean audit', () => {
  const result = {
    ok: true,
    browser: 'Chrome',
    pagesAudited: 1,
    totalErrors: 0,
    totalWarnings: 0,
    totalNetworkErrors: 0,
    results: [
      { url: 'http://127.0.0.1:3000', errors: [], warnings: [], networkErrors: [] }
    ]
  };
  const out = formatAuditResult(result);
  assert.ok(out.includes('Chrome'));
  assert.ok(out.includes('CLEAN'));
  assert.ok(out.includes('127.0.0.1:3000'));
});

test('browser-audit: formatAuditResult shows errors and network errors', () => {
  const result = {
    ok: true,
    browser: 'Edge',
    pagesAudited: 1,
    totalErrors: 2,
    totalWarnings: 1,
    totalNetworkErrors: 1,
    results: [
      {
        url: 'http://127.0.0.1:3000',
        errors: [
          { type: 'console.error', text: 'undefined is not a function', ts: Date.now() },
          { type: 'uncaught', text: 'TypeError at line 42', line: 42, ts: Date.now() }
        ],
        warnings: [
          { type: 'console.warn', text: 'deprecated API', ts: Date.now() }
        ],
        networkErrors: [
          { type: 'http-404', url: '/api/missing', status: 404, statusText: 'Not Found', ts: Date.now() }
        ]
      }
    ]
  };
  const out = formatAuditResult(result);
  assert.ok(out.includes('Errors: 2'));
  assert.ok(out.includes('Network: 1'));
  assert.ok(out.includes('console.error'));
  assert.ok(out.includes('undefined is not a function'));
  assert.ok(out.includes('http-404'));
  assert.ok(out.includes('/api/missing'));
});

test('browser-audit: formatAuditResult truncates long output', () => {
  const longText = 'x'.repeat(500);
  const result = {
    ok: true,
    browser: 'Chrome',
    pagesAudited: 1,
    totalErrors: 1,
    totalWarnings: 0,
    totalNetworkErrors: 0,
    results: [
      { url: 'http://127.0.0.1:3000', errors: [{ type: 'console.error', text: longText, ts: Date.now() }], warnings: [], networkErrors: [] }
    ]
  };
  const out = formatAuditResult(result);
  // substring(0, 200) truncates the 500-char text, full string should not appear
  assert.ok(!out.includes(longText));
  assert.ok(out.length < longText.length + 200); // output should be much shorter than 500+
});

test('gateway: audit command returns error when no browser', () => {
  // This test verifies the gateway handles audit gracefully
  // On machines without a browser, it returns an error
  // On machines with a browser but no dev server, it also returns an error
  const r = gateway.processRequest(ROOT, { cmd: 'audit', args: [] });
  // Either it fails (no browser/server) or succeeds (browser + server found)
  assert.ok(typeof r === 'object');
  assert.ok(r.ok === true || r.ok === false);
  if (!r.ok) {
    assert.ok(typeof r.error === 'string');
  }
});

test('gateway: audit command in available commands list', () => {
  // Trigger unknown command to get the available list
  const r = gateway.processRequest(ROOT, { cmd: 'nonexistent', args: [] });
  assert.ok(!r.ok);
  assert.ok(r.error.includes('audit'));
});

test('browser-audit: formatAuditResult shows crawled indicator', () => {
  const result = {
    ok: true,
    browser: 'Chrome',
    pagesAudited: 5,
    totalErrors: 0,
    totalWarnings: 0,
    totalNetworkErrors: 0,
    crawled: true,
    results: []
  };
  const out = formatAuditResult(result);
  assert.ok(out.includes('(crawled)'));
  assert.ok(out.includes('Pages: 5'));
});

test('browser-audit: formatAuditResult without crawl flag', () => {
  const result = {
    ok: true,
    browser: 'Chrome',
    pagesAudited: 1,
    totalErrors: 0,
    totalWarnings: 0,
    totalNetworkErrors: 0,
    crawled: false,
    results: []
  };
  const out = formatAuditResult(result);
  assert.ok(!out.includes('(crawled)'));
});

test('browser-audit: loadAuditConfig returns null when no config', () => {
  const config = loadAuditConfig(ROOT);
  // No .lex/audit.json in this project, should be null
  assert.ok(config === null);
});

test('browser-audit: loadAuditConfig reads login config from temp dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-cfg-'));
  const lexDir = path.join(dir, '.lex');
  fs.mkdirSync(lexDir, { recursive: true });
  const auditConfig = {
    login: {
      url: '/login',
      fields: { '#email': 'test@test.com', '#password': 'pass123' },
      submit: 'button[type=submit]'
    },
    crawl: true,
    maxDepth: 3,
    maxPages: 50
  };
  fs.writeFileSync(path.join(lexDir, 'audit.json'), JSON.stringify(auditConfig));
  const loaded = loadAuditConfig(dir);
  assert.ok(loaded !== null);
  assert.strictEqual(loaded.login.url, '/login');
  assert.strictEqual(loaded.login.fields['#email'], 'test@test.com');
  assert.strictEqual(loaded.maxDepth, 3);
  assert.strictEqual(loaded.maxPages, 50);
});

test('browser-audit: formatAuditResult shows links in crawl results', () => {
  const result = {
    ok: true,
    browser: 'Chrome',
    pagesAudited: 2,
    totalErrors: 1,
    totalWarnings: 0,
    totalNetworkErrors: 0,
    crawled: true,
    results: [
      {
        url: 'http://127.0.0.1:3000',
        errors: [],
        warnings: [],
        networkErrors: [],
        links: ['http://127.0.0.1:3000/about', 'http://127.0.0.1:3000/contact']
      },
      {
        url: 'http://127.0.0.1:3000/about',
        errors: [{ type: 'console.error', text: 'missing prop', ts: Date.now() }],
        warnings: [],
        networkErrors: [],
        links: []
      }
    ]
  };
  const out = formatAuditResult(result);
  assert.ok(out.includes('127.0.0.1:3000/about'));
  assert.ok(out.includes('console.error'));
  assert.ok(out.includes('missing prop'));
});
