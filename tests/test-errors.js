'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const gateway = require('../lib/gateway');
const ROOT = process.cwd();

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    const r = fn();
    if (r) { console.log(`  PASS  ${name}`); pass++; }
    else { console.log(`  FAIL  ${name}`); fail++; }
  } catch (e) {
    console.log(`  FAIL  ${name} — ${e.message}`);
    fail++;
  }
}

let serverProc = null;
let serverPort = 0;

function startServer() {
  return new Promise((resolve) => {
    serverProc = spawn(process.execPath, [path.join(ROOT, 'bin', 'lex.js'), 'serve'], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    let resolved = false;
    const check = () => {
      if (resolved) return;
      try {
        const info = JSON.parse(fs.readFileSync(path.join(ROOT, '.lex', 'server.json'), 'utf8'));
        if (info.port) {
          serverPort = info.port;
          resolved = true;
          resolve(serverPort);
        }
      } catch {}
    };
    
    serverProc.stdout.on('data', check);
    serverProc.stderr.on('data', check);
    setTimeout(check, 1000);
    setTimeout(check, 2000);
    setTimeout(check, 3000);
  });
}

function injectErrors(port, errors) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ errors });
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/api/console-errors', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 2000,
    }, (res) => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve(JSON.parse(b))); });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data); req.end();
  });
}

function clearErrors(port) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port, path: '/api/console-errors/clear', method: 'POST', timeout: 2000,
    }, (res) => { res.on('end', () => resolve()); res.resume(); });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function main() {
  console.log('Starting lex server...\n');
  await startServer();
  if (!serverPort) { console.log('FAIL: could not start server'); process.exit(1); }
  console.log(`Server on port ${serverPort}\n`);

  await clearErrors(serverPort);
  test('errors: no errors when server has none', () => {
    const r = gateway.processRequest(ROOT, { cmd: 'errors', args: [] });
    if (!r.ok) console.log('    err:', r.error);
    return r.ok && r.output.includes('no console errors');
  });

  await injectErrors(serverPort, [
    { type: 'console.error', message: 'Cannot read property "map" of undefined', url: 'http://localhost:3000/users', ts: Date.now() },
    { type: 'uncaught', message: 'Network Error', filename: 'app.js', lineno: 42, colno: 15, stack: 'Error: Network Error\n    at fetch (app.js:42:15)\n    at loadUsers (app.js:28:5)\n    at render (index.js:10:1)', ts: Date.now() },
    { type: 'console.warn', message: 'Deprecated: useEffect with no deps', ts: Date.now() },
  ]);

  test('errors: returns 3 errors from server', () => {
    const r = gateway.processRequest(ROOT, { cmd: 'errors', args: [] });
    if (!r.ok) console.log('    err:', r.error);
    return r.ok && r.count === 3 && r.output.includes('Cannot read property') && r.output.includes('Network Error');
  });

  test('errors: includes type and filename:lineno', () => {
    const r = gateway.processRequest(ROOT, { cmd: 'errors', args: [] });
    return r.ok && r.output.includes('[uncaught]') && r.output.includes('app.js:42');
  });

  test('errors: includes truncated stack trace', () => {
    const r = gateway.processRequest(ROOT, { cmd: 'errors', args: [] });
    return r.ok && r.output.includes('at fetch') && r.output.includes('at loadUsers');
  });

  test('batch: errors + guard in one call', () => {
    const r = gateway.processRequest(ROOT, { cmd: 'batch', args: [
      { cmd: 'errors', args: [] },
      { cmd: 'guard', args: [] },
    ]});
    return r.ok && r.output.includes('Cannot read property') && r.output.includes('no issues found');
  });

  test('token: gateway errors vs CLI run_command', () => {
    const r = gateway.processRequest(ROOT, { cmd: 'errors', args: [] });
    const gwReq = JSON.stringify({ cmd: 'errors', args: [] });
    const gwCall = JSON.stringify({ TargetFile: path.join(ROOT, '.lex', 'in', 't.json'), CodeContent: gwReq, EmptyFile: false });
    const gwResult = `Created file file:///${path.join(ROOT, '.lex', 'in', 't.json').replace(/\\/g, '/')} with requested content.`;
    const gwTokens = Math.ceil(gwCall.length / 4) + Math.ceil(gwResult.length / 4) + Math.ceil(r.output.length / 4);
    
    const cmdCall = JSON.stringify({ CommandLine: 'node bin/lex.js errors', Cwd: ROOT, Blocking: true });
    const cmdResult = r.output + '\nExit code: 0';
    const nativeTokens = Math.ceil(cmdCall.length / 4) + Math.ceil(cmdResult.length / 4);
    
    console.log(`    gateway: ${gwTokens} tokens, native: ${nativeTokens} tokens`);
    return true;
  });

  test('errors: graceful failure when server down', () => {
    try { serverProc.kill(); } catch {}
    try { fs.unlinkSync(path.join(ROOT, '.lex', 'server.json')); } catch {}
    const r = gateway.processRequest(ROOT, { cmd: 'errors', args: [] });
    return !r.ok && r.error.includes('no lex server running');
  });

  try { serverProc.kill(); } catch {}
  try { fs.unlinkSync(path.join(ROOT, '.lex', 'server.json')); } catch {}
  fs.rmSync(path.join(ROOT, '.lex', 'trash'), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, '.lex', 'in'), { recursive: true, force: true });
  fs.rmSync(path.join(ROOT, '.lex', 'out'), { recursive: true, force: true });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
