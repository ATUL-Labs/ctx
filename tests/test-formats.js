'use strict';

const fs = require('fs');
const path = require('path');
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

// Simulate what the hook does: parse content and call gateway
function simulateHook(filename, content) {
  const trimmed = (content || '').trim();
  let request;
  if (!trimmed) {
    const cmd = path.basename(filename, '.json');
    request = { cmd, args: [] };
  } else if (trimmed.startsWith('{')) {
    request = JSON.parse(trimmed);
  } else {
    const sp = trimmed.split(/\s+/);
    const cmd = sp[0];
    const rest = sp.slice(1).join(' ');
    const args = rest.includes('|') ? rest.split('|').map(s => s.trim()) : sp.slice(1);
    request = { cmd, args };
  }
  return gateway.processRequest(ROOT, request);
}

function tok(s) { return Math.ceil(s.length / 4); }

// 1. Empty file = no-arg command
test('empty file: errors.json → errors command', () => {
  const r = simulateHook('.lex/in/errors.json', '');
  // Will fail because no server, but should get the right error
  return !r.ok && r.error.includes('no lex server running');
});

test('empty file: guard.json → guard command', () => {
  const r = simulateHook('.lex/in/guard.json', '');
  return r.ok && r.output.includes('no issues found');
});

test('empty file: diff.json → diff command', () => {
  const r = simulateHook('.lex/in/diff.json', '');
  return r.ok && (r.output.includes('no changes') || r.output.includes('M'));
});

// 2. Plain text format
test('plain text: search ValidationError', () => {
  const r = simulateHook('.lex/in/r.json', 'search ValidationError');
  return r.ok;
});

test('plain text: symbols lib/gateway.js', () => {
  const r = simulateHook('.lex/in/r.json', 'symbols lib/gateway.js');
  return r.ok;
});

test('plain text: grep with pipe separator', () => {
  const r = simulateHook('.lex/in/r.json', 'grep require|lib/gateway.js');
  return r.ok;
});

test('plain text: refs with single arg', () => {
  const r = simulateHook('.lex/in/r.json', 'refs process');
  return r.ok;
});

// 3. JSON still works (backward compat)
test('JSON: search still works', () => {
  const r = simulateHook('.lex/in/req.json', '{"cmd":"search","args":["ValidationError"]}');
  return r.ok;
});

test('JSON: patch still works', () => {
  const r = simulateHook('.lex/in/req.json', '{"cmd":"guard","args":[]}');
  return r.ok;
});

// 4. Token savings comparison
test('token: empty file saves vs JSON for no-arg commands', () => {
  // JSON format
  const jsonCall = JSON.stringify({ TargetFile: path.join(ROOT, '.lex', 'in', 'battle.json'), CodeContent: '{"cmd":"guard","args":[]}', EmptyFile: false });
  const jsonResult = `Created file file:///${path.join(ROOT, '.lex', 'in', 'battle.json').replace(/\\/g, '/')} with requested content.`;
  const jsonTotal = tok(jsonCall) + tok(jsonResult);

  // Empty file format
  const emptyCall = JSON.stringify({ TargetFile: path.join(ROOT, '.lex', 'in', 'guard.json'), CodeContent: '', EmptyFile: true });
  const emptyResult = `Created file file:///${path.join(ROOT, '.lex', 'in', 'guard.json').replace(/\\/g, '/')} with requested content.`;
  const emptyTotal = tok(emptyCall) + tok(emptyResult);

  console.log(`    JSON: ${jsonTotal} tokens, empty: ${emptyTotal} tokens, saved: ${jsonTotal - emptyTotal}`);
  return emptyTotal < jsonTotal;
});

test('token: plain text saves vs JSON for 1-arg commands', () => {
  // JSON format
  const jsonCall = JSON.stringify({ TargetFile: path.join(ROOT, '.lex', 'in', 'battle.json'), CodeContent: '{"cmd":"search","args":["ValidationError"]}', EmptyFile: false });
  const jsonResult = `Created file file:///${path.join(ROOT, '.lex', 'in', 'battle.json').replace(/\\/g, '/')} with requested content.`;
  const jsonTotal = tok(jsonCall) + tok(jsonResult);

  // Plain text format
  const textCall = JSON.stringify({ TargetFile: path.join(ROOT, '.lex', 'in', 'r.json'), CodeContent: 'search ValidationError', EmptyFile: false });
  const textResult = `Created file file:///${path.join(ROOT, '.lex', 'in', 'r.json').replace(/\\/g, '/')} with requested content.`;
  const textTotal = tok(textCall) + tok(textResult);

  console.log(`    JSON: ${jsonTotal} tokens, text: ${textTotal} tokens, saved: ${jsonTotal - textTotal}`);
  return textTotal < jsonTotal;
});

// Cleanup
fs.rmSync(path.join(ROOT, '.lex', 'trash'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, '.lex', 'in'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, '.lex', 'out'), { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
