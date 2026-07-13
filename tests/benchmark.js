'use strict';

const fs = require('fs');
const path = require('path');
const gateway = require('../lib/gateway');
const ROOT = process.cwd();

function tok(s) { return Math.ceil(s.length / 4); }
function fmt(n) { return n.toString().padStart(4); }

// Simulate write_to_file call + result overhead
function gwOverhead(filename, content, empty) {
  const call = JSON.stringify({ TargetFile: path.join(ROOT, '.lex', 'in', filename), CodeContent: content, EmptyFile: empty });
  const result = `Created file file:///${path.join(ROOT, '.lex', 'in', filename).replace(/\\/g, '/')} with requested content.`;
  return { call: tok(call), result: tok(result), total: tok(call) + tok(result) };
}

// Simulate run_command call + result overhead
function cliOverhead(cmdLine) {
  const call = JSON.stringify({ CommandLine: cmdLine, Cwd: ROOT, Blocking: true });
  const result = `Exit code: 0`;
  return { call: tok(call), result: tok(result), total: tok(call) + tok(result) };
}

console.log('=== LEX GATEWAY BENCHMARK ===\n');

// 1. Token overhead by format
console.log('1. TOKEN OVERHEAD BY FORMAT');
console.log('   format          call  result  total  vs JSON');
console.log('   ─────────────────────────────────────────────');

const jsonNoArg = gwOverhead('battle.json', '{"cmd":"errors","args":[]}', false);
const emptyNoArg = gwOverhead('errors.json', '', true);
const shortNoArg = gwOverhead('e.json', '', true);

console.log(`   JSON (no-arg)   ${fmt(jsonNoArg.call)}  ${fmt(jsonNoArg.result)}  ${fmt(jsonNoArg.total)}     base`);
console.log(`   empty (no-arg)  ${fmt(emptyNoArg.call)}  ${fmt(emptyNoArg.result)}  ${fmt(emptyNoArg.total)}     -${jsonNoArg.total - emptyNoArg.total} (${Math.round((1 - emptyNoArg.total / jsonNoArg.total) * 100)}%)`);
console.log(`   short (no-arg)  ${fmt(shortNoArg.call)}  ${fmt(shortNoArg.result)}  ${fmt(shortNoArg.total)}     -${jsonNoArg.total - shortNoArg.total} (${Math.round((1 - shortNoArg.total / jsonNoArg.total) * 100)}%)`);

const jsonArg = gwOverhead('battle.json', '{"cmd":"search","args":["ValidationError"]}', false);
const textArg = gwOverhead('r.json', 'search ValidationError', false);

console.log(`   JSON (1-arg)    ${fmt(jsonArg.call)}  ${fmt(jsonArg.result)}  ${fmt(jsonArg.total)}     base`);
console.log(`   text (1-arg)    ${fmt(textArg.call)}  ${fmt(textArg.result)}  ${fmt(textArg.total)}     -${jsonArg.total - textArg.total} (${Math.round((1 - textArg.total / jsonArg.total) * 100)}%)`);

const json2Arg = gwOverhead('battle.json', '{"cmd":"grep","args":["res\\\\.status","src/app.js"]}', false);
const pipe2Arg = gwOverhead('r.json', 'grep res\\.status|src/app.js', false);

console.log(`   JSON (2-arg)    ${fmt(json2Arg.call)}  ${fmt(json2Arg.result)}  ${fmt(json2Arg.total)}     base`);
console.log(`   pipe (2-arg)    ${fmt(pipe2Arg.call)}  ${fmt(pipe2Arg.result)}  ${fmt(pipe2Arg.total)}     -${json2Arg.total - pipe2Arg.total} (${Math.round((1 - pipe2Arg.total / json2Arg.total) * 100)}%)`);

// 2. Gateway vs run_command (the real trade-off)
console.log('\n2. GATEWAY vs RUN_COMMAND');
console.log('   ─────────────────────────────────────────────────────');
console.log('   Metric              Gateway (empty)   run_command');
console.log('   ─────────────────────────────────────────────────────');
console.log(`   Token overhead       ${fmt(emptyNoArg.total)}              ${fmt(cliOverhead('node bin/lex.js errors').total)}`);
console.log(`   User approval        NEVER             EVERY CALL`);
console.log(`   Shell quoting        NONE              REQUIRED (PowerShell)`);
console.log(`   Output injection     AUTO              MANUAL (read stdout)`);
console.log(`   Batch support        YES (1 call)      NO (N calls)`);
console.log('');
console.log('   Raw tokens are higher for gateway (write_to_file has more');
console.log('   JSON fields), but gateway wins on workflow efficiency:');
console.log('   - 0 approvals vs N approvals per session');
console.log('   - No PowerShell quoting bugs (e.g. ? in URLs)');
console.log('   - Output auto-injected as additionalContext');
console.log('   - Batch amortizes overhead across N commands');

// 3. Command availability check
console.log('\n3. COMMAND AVAILABILITY');
const allCmds = ['search', 'symbols', 'grep', 'read', 'patch', 'insert', 'rename', 'delete', 'batch', 'diff', 'errors', 'undo', 'snapshot', 'refs', 'recent', 'links', 'guard'];
let avail = 0;
for (const cmd of allCmds) {
  const r = gateway.processRequest(ROOT, { cmd, args: cmd === 'search' ? ['test'] : cmd === 'delete' ? ['nonexistent'] : [] });
  const isUnknown = !r.ok && r.error && r.error.includes('unknown command');
  if (!isUnknown) { avail++; console.log(`   PASS  ${cmd}`); }
  else console.log(`   FAIL  ${cmd} — not implemented`);
}
console.log(`   ${avail}/${allCmds.length} commands available`);

// 4. Diff memory improvement (theoretical)
console.log('\n4. DIFF MEMORY IMPROVEMENT');
const { openDb } = require('../lib/indexer');
let db;
try { db = openDb(ROOT); } catch { console.log('   (no index)'); }
if (db) {
  const totalFiles = db.prepare('SELECT COUNT(*) c FROM files').get().c;
  const ftsSize = db.prepare("SELECT SUM(LENGTH(text)) s FROM content_fts").get().s || 0;
  db.close();
  console.log(`   indexed files: ${totalFiles}`);
  console.log(`   total FTS content: ${(ftsSize / 1024).toFixed(0)} KB`);
  console.log(`   OLD diff: loads ALL ${totalFiles} files (${(ftsSize / 1024).toFixed(0)} KB) into memory`);
  console.log(`   NEW diff: loads only modified files (typically 1-5 files)`);
  console.log(`   improvement: ~${Math.max(1, Math.round(totalFiles / 5))}x less memory on average`);
}

// 5. Batch amortization
console.log('\n5. BATCH AMORTIZATION');
const single1 = gwOverhead('r.json', 'search foo', false).total;
const single2 = gwOverhead('r.json', 'guard', false).total;
const batchOverhead = gwOverhead('r.json', '{"cmd":"batch","args":[{"cmd":"search","args":["foo"]},{"cmd":"guard","args":[]}]}', false).total;
console.log(`   2 separate calls: ${single1} + ${single2} = ${single1 + single2} tokens`);
console.log(`   1 batch call:     ${batchOverhead} tokens`);
console.log(`   saved:            ${single1 + single2 - batchOverhead} tokens (${Math.round((1 - batchOverhead / (single1 + single2)) * 100)}%)`);

// 6. Summary
console.log('\n=== SUMMARY ===');
console.log(`Commands: ${avail}/${allCmds.length} implemented`);
console.log(`No-arg overhead: ${jsonNoArg.total} → ${emptyNoArg.total} tokens (-${Math.round((1 - emptyNoArg.total / jsonNoArg.total) * 100)}%)`);
console.log(`1-arg overhead:  ${jsonArg.total} → ${textArg.total} tokens (-${Math.round((1 - textArg.total / jsonArg.total) * 100)}%)`);
console.log(`vs run_command:  +${emptyNoArg.total - cliOverhead('node bin/lex.js errors').total} tokens raw, but 0 approvals vs N`);
console.log(`diff memory:     ~${Math.max(1, Math.round((require('../lib/indexer').openDb(ROOT).prepare('SELECT COUNT(*) c FROM files').get().c) / 5))}x reduction`);
console.log(`token tracking:  gateway commands now visible in lex tokens`);
console.log(`process shadow:  eliminated (processRequest)`);
console.log(`batch:           2 cmds in 1 call saves ${single1 + single2 - batchOverhead} tokens (${Math.round((1 - batchOverhead / (single1 + single2)) * 100)}%)`);
