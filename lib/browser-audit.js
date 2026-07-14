'use strict';

const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { findBrowser } = require('./browser-detect');

let msgId = 0;

function cdpEvaluate(ws, expression, timeout = 5000) {
  return cdpCall(ws, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeout);
}

function loadAuditConfig(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.lex', 'audit.json'), 'utf8'));
  } catch { return null; }
}

function makeListener(ws, url, errors, warnings, networkErrors) {
  return (ev) => {
    try {
      const raw = typeof ev === 'string' ? ev : (ev.data || ev.toString());
      const msg = JSON.parse(raw);
      if (!msg.method) return;

      if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params.type;
        const text = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
        if (type === 'error') {
          errors.push({ type: 'console.error', text, url, ts: Date.now() });
        } else if (type === 'warning') {
          warnings.push({ type: 'console.warn', text, url, ts: Date.now() });
        }
      }

      if (msg.method === 'Runtime.exceptionThrown') {
        const details = msg.params.exceptionDetails;
        const text = details.exception
          ? (details.exception.description || details.exception.value || details.text)
          : details.text;
        errors.push({
          type: 'uncaught',
          text: String(text).substring(0, 500),
          url,
          line: details.lineNumber,
          col: details.columnNumber,
          ts: Date.now(),
        });
      }

      if (msg.method === 'Network.responseReceived') {
        const resp = msg.params.response;
        const status = resp.status;
        if (status >= 400) {
          networkErrors.push({
            type: 'http-' + status,
            url: resp.url,
            status,
            statusText: resp.statusText,
            resourceType: msg.params.type,
            pageUrl: url,
            ts: Date.now(),
          });
        }
      }

      if (msg.method === 'Network.loadingFailed') {
        const fail = msg.params;
        networkErrors.push({
          type: 'network-failed',
          url: fail.requestId,
          errorText: fail.errorText,
          resourceType: fail.type,
          pageUrl: url,
          ts: Date.now(),
        });
      }
    } catch {}
  };
}

async function navigateAndWait(ws, url, waitMs) {
  await cdpCall(ws, 'Page.navigate', { url }, 10000);
  await new Promise(r => setTimeout(r, waitMs));
}

async function extractLinks(ws, baseUrl) {
  const js = `
    (function() {
      var base = ${JSON.stringify(baseUrl)};
      var origin = new URL(base).origin;
      var links = [];
      document.querySelectorAll('a[href]').forEach(function(a) {
        var href = a.href;
        if (!href) return;
        try {
          var u = new URL(href, base);
          if (u.origin === origin) {
            var clean = u.origin + u.pathname + u.search;
            if (links.indexOf(clean) === -1) links.push(clean);
          }
        } catch(e) {}
      });
      return links;
    })()
  `;
  const result = await cdpEvaluate(ws, js);
  return result.result?.value || [];
}

async function performLogin(ws, loginConfig) {
  const fields = loginConfig.fields || {};
  const fieldEntries = Object.entries(fields).map(([selector, value]) => {
    return `var el = document.querySelector(${JSON.stringify(selector)});
    if (el) { el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }`;
  }).join('\n');

  const submitJs = `
    (function() {
      ${fieldEntries}
      var submit = document.querySelector(${JSON.stringify(loginConfig.submit || 'button[type=submit]')});
      if (submit) submit.click();
      return 'done';
    })()
  `;
  await cdpEvaluate(ws, submitJs);
  await new Promise(r => setTimeout(r, 2000));
}

function normalizeUrl(raw) {
  try {
    const u = new URL(raw);
    return u.origin + u.pathname + u.search;
  } catch { return raw; }
}

function cdpCall(ws, method, params = {}, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const timer = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), timeout);
    const handler = (ev) => {
      try {
        const raw = typeof ev === 'string' ? ev : (ev.data || ev.toString());
        const msg = JSON.parse(raw);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          clearTimeout(timer);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch {}
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function getDebuggingTargets(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/json/list',
      timeout: 2000,
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(Array.isArray(parsed) ? parsed : (parsed.targets || []));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function getBrowserWsUrl(port) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 10;
    function tryGet() {
      const req = http.get({
        hostname: '127.0.0.1',
        port,
        path: '/json/version',
        timeout: 2000,
      }, (res) => {
        let body = '';
        res.on('data', (d) => body += d);
        res.on('end', () => {
          try {
            const info = JSON.parse(body);
            if (info.webSocketDebuggerUrl) resolve(info.webSocketDebuggerUrl);
            else if (++attempts < maxAttempts) setTimeout(tryGet, 300);
            else reject(new Error('no browser ws url after ' + maxAttempts + ' attempts'));
          } catch (e) {
            if (++attempts < maxAttempts) setTimeout(tryGet, 300);
            else reject(e);
          }
        });
      });
      req.on('error', () => {
        if (++attempts < maxAttempts) setTimeout(tryGet, 300);
        else reject(new Error('connection failed'));
      });
      req.on('timeout', () => { req.destroy(); if (++attempts < maxAttempts) setTimeout(tryGet, 300); else reject(new Error('timeout')); });
    }
    tryGet();
  });
}

function getBrowserTarget(port) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = 10;
    function tryGet() {
      const req = http.get({
        hostname: '127.0.0.1',
        port,
        path: '/json/list',
        timeout: 2000,
      }, (res) => {
        let body = '';
        res.on('data', (d) => body += d);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const targets = Array.isArray(parsed) ? parsed : (parsed.targets || []);
            const page = targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
            if (page) resolve(page);
            else if (++attempts < maxAttempts) setTimeout(tryGet, 300);
            else reject(new Error('no page target found after ' + maxAttempts + ' attempts'));
          } catch (e) {
            if (++attempts < maxAttempts) setTimeout(tryGet, 300);
            else reject(e);
          }
        });
      });
      req.on('error', () => {
        if (++attempts < maxAttempts) setTimeout(tryGet, 300);
        else reject(new Error('connection failed'));
      });
      req.on('timeout', () => { req.destroy(); if (++attempts < maxAttempts) setTimeout(tryGet, 300); else reject(new Error('timeout')); });
    }
    tryGet();
  });
}

function closeTarget(port, targetId) {
  return new Promise((resolve) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/json/close/' + targetId,
      timeout: 2000,
    }, () => resolve());
    req.on('error', () => resolve());
  });
}

async function auditPage(ws, url, options) {
  const errors = [];
  const warnings = [];
  const networkErrors = [];
  const listener = makeListener(ws, url, errors, warnings, networkErrors);
  ws.addEventListener('message', listener);

  await navigateAndWait(ws, url, options.waitMs || 3000);

  let links = [];
  if (options.crawl !== false) {
    try { links = await extractLinks(ws, url); } catch {}
  }

  ws.removeEventListener('message', listener);
  return { url, errors, warnings, networkErrors, links };
}

async function runAudit(urls, options = {}) {
  const browser = findBrowser();
  if (!browser) {
    return {
      ok: false,
      error: 'No browser found. Install Chrome, Edge, or Brave.',
      results: [],
    };
  }

  // Load audit config (login, crawl settings)
  const config = loadAuditConfig(options.root || process.cwd()) || {};
  const crawl = options.crawl !== false && config.crawl !== false;
  const maxDepth = options.maxDepth || config.maxDepth || 2;
  const maxPages = options.maxPages || config.maxPages || 30;
  const waitMs = options.waitMs || config.waitMs || 3000;

  // Use lex port range 4747-4755, skip the port lex serve is already using
  const servePorts = [4747, 4748, 4749, 4750, 4751, 4752, 4753, 4754, 4755];
  let servePort = 0;
  try {
    const info = JSON.parse(fs.readFileSync(path.join(options.root || process.cwd(), '.lex', 'server.json'), 'utf8'));
    if (info.port) servePort = info.port;
  } catch {}
  const port = options.port || 0;
  let actualPort;
  if (port) {
    actualPort = port;
  } else {
    // Probe each port in the lex range for availability
    const net = require('node:net');
    const tryPort = (p) => new Promise((resolve) => {
      const tester = net.createServer();
      tester.once('error', () => resolve(false));
      tester.once('listening', () => { tester.close(() => resolve(true)); });
      tester.listen(p, '127.0.0.1');
    });
    for (const p of servePorts) {
      if (p === servePort) continue;
      const available = await tryPort(p);
      if (available) { actualPort = p; break; }
    }
    if (!actualPort) {
      return { ok: false, error: 'No available port in range 4747-4755 for CDP debugging', browser: browser.name, results: [] };
    }
  }

  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=' + actualPort,
    '--remote-debugging-address=127.0.0.1',
    '--window-size=1280,720',
  ];

  const child = spawn(browser.path, args, {
    stdio: 'ignore',
    detached: false,
  });

  const results = [];

  try {
    // Wait for debugging port to be ready
    let ready = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 300));
      try {
        await getDebuggingTargets(actualPort);
        ready = true;
        break;
      } catch {}
    }

    if (!ready) {
      return {
        ok: false,
        error: 'Browser started but debugging port never became ready',
        browser: browser.name,
        results: [],
      };
    }

    // Get browser-level WebSocket URL and create a page target via CDP
    let browserWsUrl;
    try {
      browserWsUrl = await getBrowserWsUrl(actualPort);
    } catch (e) {
      return { ok: false, error: 'Cannot connect to browser: ' + e.message, browser: browser.name, results: [] };
    }

    // Connect to browser-level endpoint and create a new page
    const browserWs = new WebSocket(browserWsUrl);
    await new Promise((resolve, reject) => {
      browserWs.addEventListener('open', resolve);
      browserWs.addEventListener('error', reject);
      setTimeout(() => reject(new Error('browser ws timeout')), 3000);
    });

    // Create a new page target
    const createResult = await cdpCall(browserWs, 'Target.createTarget', { url: 'about:blank' });
    const targetId = createResult.targetId;
    browserWs.close();

    // Now get the page target's WebSocket URL
    let wsUrl;
    let targetFound = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 300));
      try {
        const targets = await getDebuggingTargets(actualPort);
        if (Array.isArray(targets)) {
          const page = targets.find(t => t.id === targetId || (t.type === 'page' && t.webSocketDebuggerUrl));
          if (page && page.webSocketDebuggerUrl) {
            wsUrl = page.webSocketDebuggerUrl;
            targetFound = true;
            break;
          }
        }
      } catch {}
    }

    if (!targetFound || !wsUrl) {
      return { ok: false, error: 'Failed to create page target', browser: browser.name, results: [] };
    }

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
      setTimeout(() => reject(new Error('ws timeout')), 3000);
    });

    // Enable domains once for the entire session
    await cdpCall(ws, 'Runtime.enable');
    await cdpCall(ws, 'Page.enable');
    await cdpCall(ws, 'Network.enable');

    // Perform login if configured
    if (config.login && config.login.url) {
      const loginUrl = urls[0].replace(/\/$/, '') + config.login.url;
      process.stderr.write('login: ' + loginUrl + '\n');
      await navigateAndWait(ws, loginUrl, waitMs);
      await performLogin(ws, config.login);
      process.stderr.write('login: submitted, waiting for redirect...\n');
      await new Promise(r => setTimeout(r, 2000));
    }

    // BFS crawl
    const visited = new Set();
    const queue = urls.map(u => ({ url: normalizeUrl(u), depth: 0 }));

    while (queue.length > 0 && results.length < maxPages) {
      const { url, depth } = queue.shift();
      const norm = normalizeUrl(url);
      if (visited.has(norm)) continue;
      visited.add(norm);

      process.stderr.write('audit: [' + depth + '/' + maxDepth + '] ' + norm + '\n');

      try {
        const result = await auditPage(ws, norm, { waitMs, crawl: crawl && depth < maxDepth });
        results.push(result);

        // Queue discovered links
        if (crawl && depth < maxDepth && result.links) {
          for (const link of result.links) {
            const normLink = normalizeUrl(link);
            if (!visited.has(normLink) && !queue.some(q => normalizeUrl(q.url) === normLink)) {
              queue.push({ url: normLink, depth: depth + 1 });
            }
          }
        }
      } catch (e) {
        results.push({ url: norm, error: e.message, errors: [], warnings: [], networkErrors: [], links: [] });
      }
    }

    ws.close();
  } finally {
    try { child.kill('SIGTERM'); } catch {}
    try {
      if (os.platform() === 'win32') {
        spawn('taskkill', ['/pid', child.pid, '/f', '/t'], { stdio: 'ignore' });
      }
    } catch {}
  }

  // Summarize
  const totalErrors = results.reduce((s, r) => s + (r.errors?.length || 0), 0);
  const totalWarnings = results.reduce((s, r) => s + (r.warnings?.length || 0), 0);
  const totalNetworkErrors = results.reduce((s, r) => s + (r.networkErrors?.length || 0), 0);

  return {
    ok: true,
    browser: browser.name,
    pagesAudited: results.length,
    totalErrors,
    totalWarnings,
    totalNetworkErrors,
    crawled: crawl,
    results,
  };
}

function formatAuditResult(result) {
  if (!result.ok) {
    return 'BROWSER AUDIT FAILED: ' + result.error;
  }

  let out = 'BROWSER AUDIT (' + result.browser + ')\n';
  out += 'Pages: ' + result.pagesAudited + (result.crawled ? ' (crawled)' : '') + ' | Errors: ' + result.totalErrors + ' | Warnings: ' + result.totalWarnings + ' | Network: ' + result.totalNetworkErrors + '\n';

  for (const r of result.results) {
    out += '\n--- ' + r.url + ' ---\n';
    if (r.error) {
      out += '  ERROR: ' + r.error + '\n';
      continue;
    }
    if (r.errors?.length) {
      out += '  Console errors (' + r.errors.length + '):\n';
      for (const e of r.errors.slice(0, 10)) {
        out += '    [' + e.type + '] ' + String(e.text).substring(0, 200) + '\n';
      }
      if (r.errors.length > 10) out += '    ... and ' + (r.errors.length - 10) + ' more\n';
    }
    if (r.networkErrors?.length) {
      out += '  Network errors (' + r.networkErrors.length + '):\n';
      for (const e of r.networkErrors.slice(0, 10)) {
        out += '    [' + e.type + '] ' + (e.url || '') + ' ' + (e.errorText || e.statusText || '') + '\n';
      }
      if (r.networkErrors.length > 10) out += '    ... and ' + (r.networkErrors.length - 10) + ' more\n';
    }
    if (r.warnings?.length) {
      out += '  Warnings (' + r.warnings.length + '):\n';
      for (const w of r.warnings.slice(0, 5)) {
        out += '    [' + w.type + '] ' + String(w.text).substring(0, 150) + '\n';
      }
      if (r.warnings.length > 5) out += '    ... and ' + (r.warnings.length - 5) + ' more\n';
    }
    if (!r.errors?.length && !r.networkErrors?.length && !r.warnings?.length) {
      out += '  CLEAN - no errors detected\n';
    }
  }

  return out;
}

module.exports = { runAudit, formatAuditResult, findBrowser, loadAuditConfig };
