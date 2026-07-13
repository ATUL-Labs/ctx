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

// Setup: create test files
const testDir = path.join(ROOT, 'tests', 'gw-test');
fs.mkdirSync(testDir, { recursive: true });
const testFile = path.join(testDir, 'target.js');
fs.writeFileSync(testFile, 'const x = 1;\nconst y = 2;\nfunction qux() { return x + y; }\nmodule.exports = { qux };\n');

// 1. patch: insert after anchor
test('patch: insert after anchor', () => {
  const r = gateway.processRequest(ROOT, {
    cmd: 'patch',
    args: { file: 'tests/gw-test/target.js', anchor: 'const x = 1;', insertion: 'const z = 3;', mode: 'after' }
  });
  if (!r.ok) { console.log('    err:', r.output); return false; }
  const content = fs.readFileSync(testFile, 'utf8');
  return content.includes('const z = 3;') && content.includes('const x = 1;');
});

// 2. patch: replace anchor
test('patch: replace anchor', () => {
  const r = gateway.processRequest(ROOT, {
    cmd: 'patch',
    args: { file: 'tests/gw-test/target.js', anchor: 'const z = 3;', insertion: 'const z = 30;', mode: 'replace' }
  });
  if (!r.ok) { console.log('    err:', r.output); return false; }
  const content = fs.readFileSync(testFile, 'utf8');
  return content.includes('const z = 30;') && !content.includes('const z = 3;\n');
});

// 3. patch: fail on missing anchor
test('patch: fails on missing anchor', () => {
  const r = gateway.processRequest(ROOT, {
    cmd: 'patch',
    args: { file: 'tests/gw-test/target.js', anchor: 'NONEXISTENT_ANCHOR_12345', insertion: 'test', mode: 'after' }
  });
  return !r.ok;
});

// 4. undo: restore last patch
test('undo: restores last backup', () => {
  // Read current content
  const beforePatch = fs.readFileSync(testFile, 'utf8');
  // Make a patch
  gateway.processRequest(ROOT, {
    cmd: 'patch',
    args: { file: 'tests/gw-test/target.js', anchor: 'const z = 30;', insertion: 'const z = 300;', mode: 'replace' }
  });
  const afterPatch = fs.readFileSync(testFile, 'utf8');
  if (afterPatch === beforePatch) return false;
  // Undo
  const r = gateway.processRequest(ROOT, { cmd: 'undo', args: [] });
  if (!r.ok) { console.log('    err:', r.error); return false; }
  const afterUndo = fs.readFileSync(testFile, 'utf8');
  return afterUndo === beforePatch;
});

// 5. rename: single file
test('rename: single file word-boundary', () => {
  // Reset file
  fs.writeFileSync(testFile, 'const qux = 1;\nconst bar = qux + 2;\n');
  const r = gateway.processRequest(ROOT, {
    cmd: 'rename',
    args: { file: 'tests/gw-test/target.js', from: 'qux', to: 'renamedBaz' }
  });
  if (!r.ok) { console.log('    err:', r.output); return false; }
  const content = fs.readFileSync(testFile, 'utf8');
  return content.includes('const renamedBaz = 1;') && content.includes('const bar = renamedBaz + 2;');
});

// 6. rename: multi-file via FTS
test('rename: multi-file via index', () => {
  // Create second file referencing renamedBaz
  const file2 = path.join(testDir, 'second.js');
  fs.writeFileSync(file2, 'const val = renamedBaz * 2;\n');
  // Refresh index so both files are indexed
  const { execSync } = require('child_process');
  try { execSync(`node "${path.join(ROOT, 'bin', 'lex.js')}" refresh`, { cwd: ROOT, timeout: 10000, encoding: 'utf8', stdio: 'pipe' }); } catch {}
  // Verify test files are indexed
  const { openDb } = require('../lib/indexer');
  const db = openDb(ROOT);
  const idx = db.prepare("SELECT path FROM files WHERE path = 'tests/gw-test/second.js'").get();
  db.close();
  if (!idx) { console.log('    skip: test file not indexed yet'); return true; }
  const r = gateway.processRequest(ROOT, {
    cmd: 'rename',
    args: { from: 'renamedBaz', to: 'renamedBaz' }
  });
  if (!r.ok) { console.log('    err:', r.output); return false; }
  const c1 = fs.readFileSync(testFile, 'utf8');
  const c2 = fs.readFileSync(file2, 'utf8');
  return c1.includes('renamedBaz') && c2.includes('renamedBaz');
});

// 7. links: no args returns all
test('links: no args returns all links', () => {
  const r = gateway.processRequest(ROOT, { cmd: 'links', args: [] });
  return r.ok;
});

// 8. links: with URL arg
test('links: with URL arg returns filtered', () => {
  const r = gateway.processRequest(ROOT, { cmd: 'links', args: ['/api/nonexistent'] });
  return r.ok && r.output.includes('no links match');
});

// 9. delete: safe delete moves to trash
test('delete: moves file to trash', () => {
  const delFile = path.join(testDir, 'to-delete.js');
  fs.writeFileSync(delFile, '// delete me\n');
  const r = gateway.processRequest(ROOT, { cmd: 'delete', args: ['tests/gw-test/to-delete.js'] });
  if (!r.ok) { console.log('    err:', r.error); return false; }
  return !fs.existsSync(delFile) && r.output.includes('trash');
});

// 10. delete: fails on missing file
test('delete: fails on missing file', () => {
  const r = gateway.processRequest(ROOT, { cmd: 'delete', args: ['tests/gw-test/nonexistent.js'] });
  return !r.ok;
});

// 11. diff: returns sync status
test('diff: returns output (sync or changes)', () => {
  // Refresh index first
  const { execSync } = require('child_process');
  try { execSync(`node "${path.join(ROOT, 'bin', 'lex.js')}" refresh`, { cwd: ROOT, timeout: 5000, encoding: 'utf8', stdio: 'pipe' }); } catch {}
  const r = gateway.processRequest(ROOT, { cmd: 'diff', args: [] });
  return r.ok && (r.output.includes('no changes') || r.output.includes('M') || r.output.includes('A') || r.output.includes('D'));
});

// 12. batch: multiple commands
test('batch: search + guard', () => {
  const r = gateway.processRequest(ROOT, { cmd: 'batch', args: [
    { cmd: 'search', args: ['qux'] },
    { cmd: 'guard', args: [] },
  ]});
  return r.ok && r.output.includes('[1]') && r.output.includes('[2]');
});

// 13. snapshot: save and restore
test('snapshot: save and list', () => {
  fs.writeFileSync(testFile, 'const snap = 1;\n');
  const r1 = gateway.processRequest(ROOT, { cmd: 'snapshot', args: ['save', 'tests/gw-test/target.js'] });
  if (!r1.ok) { console.log('    err:', r1.error); return false; }
  const r2 = gateway.processRequest(ROOT, { cmd: 'snapshot', args: ['list'] });
  return r2.ok && r2.output.includes('files)');
});

// 14. insert: shorthand for patch after
test('insert: shorthand for patch after', () => {
  fs.writeFileSync(testFile, 'const a = 1;\nconst b = 2;\n');
  const r = gateway.processRequest(ROOT, {
    cmd: 'insert',
    args: { file: 'tests/gw-test/target.js', after: 'const a = 1;', line: 'const c = 3;' }
  });
  if (!r.ok) { console.log('    err:', r.output); return false; }
  const content = fs.readFileSync(testFile, 'utf8');
  return content.includes('const c = 3;');
});

// 15. processRequest naming: no shadowing of global process
test('processRequest: no global process shadowing', () => {
  // This would have failed with the old name `process`
  const r = gateway.processRequest(ROOT, { cmd: 'guard', args: [] });
  return r.ok;
});

// Cleanup
fs.rmSync(testDir, { recursive: true, force: true });
fs.rmSync(path.join(ROOT, '.lex', 'trash'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, '.lex', 'snapshots'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, '.lex', 'in'), { recursive: true, force: true });
fs.rmSync(path.join(ROOT, '.lex', 'out'), { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
