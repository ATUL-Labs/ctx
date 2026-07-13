'use strict';
const fs = require('node:fs');
const path = require('node:path');

/**
 * Smart surgical patch - insert/replace/delete by anchor.
 *
 * Features that make it agent-friendly:
 * - Auto-anchor: long anchors auto-shortened to shortest unique substring
 * - Fuzzy match: if exact anchor not found, finds closest match
 * - Context on failure: shows 5 lines around closest match
 * - Diff output: shows what changed after patching
 * - Preview mode: --preview shows diff without applying
 */

// Find the shortest substring of `anchor` that is unique in `content`
function shortestUniqueSubstring(content, anchor) {
  const minLen = 5;
  for (let len = Math.min(anchor.length, 60); len >= minLen; len--) {
    const offsets = [0, anchor.length - len, Math.floor((anchor.length - len) / 2)];
    for (const off of offsets) {
      if (off < 0) continue;
      const sub = anchor.slice(off, off + len);
      const first = content.indexOf(sub);
      if (first !== -1 && content.indexOf(sub, first + 1) === -1) {
        return { substring: sub, offset: first };
      }
    }
  }
  return null;
}

// Simple Levenshtein distance
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

// Find closest match for anchor in content
// Tries sliding window first, then line-based matching as fallback
function findClosestMatch(content, anchor) {
  const aLen = anchor.length;
  if (aLen > content.length) return null;
  let bestIdx = -1;
  let bestDist = Infinity;
  const step = aLen < 40 ? 1 : Math.max(1, Math.floor(aLen / 4));
  for (let i = 0; i <= content.length - aLen; i += step) {
    const chunk = content.slice(i, i + aLen);
    let common = 0;
    for (let j = 0; j < Math.min(20, aLen); j++) {
      if (chunk[j] === anchor[j]) common++;
    }
    if (common < 5) continue;
    const dist = levenshtein(chunk, anchor);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  // Fallback: try line-based matching (compare anchor to each line)
  if (bestIdx === -1) {
    const lines = content.split(/\r?\n/);
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Compare anchor to the line itself (trimmed)
      const trimmed = line.trim();
      if (Math.abs(trimmed.length - aLen) < aLen * 0.5) {
        const dist = levenshtein(trimmed, anchor);
        const sim = 1 - dist / aLen;
        if (sim > 0.5 && dist < bestDist) {
          bestDist = dist;
          bestIdx = offset;
        }
      }
      // Also try: does any substring of the line match the anchor?
      if (line.length >= aLen * 0.5) {
        for (let s = 0; s <= line.length - aLen; s++) {
          const sub = line.slice(s, s + aLen);
          let common = 0;
          for (let j = 0; j < Math.min(15, aLen); j++) {
            if (sub[j] === anchor[j]) common++;
          }
          if (common < 5) continue;
          const dist = levenshtein(sub, anchor);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = offset + s;
          }
        }
      }
      offset += line.length + 1;
    }
  }
  if (bestIdx === -1) return null;
  return { offset: bestIdx, distance: bestDist, similarity: Math.round((1 - bestDist / aLen) * 100) };
}

// Get line number from character offset
function offsetToLine(content, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

// Get context lines around an offset
function getContext(content, offset, before, after) {
  const lineNum = offsetToLine(content, offset);
  const lines = content.split(/\r?\n/);
  const start = Math.max(0, lineNum - 1 - before);
  const end = Math.min(lines.length, lineNum + after);
  const result = [];
  for (let i = start; i < end; i++) {
    const marker = (i === lineNum - 1) ? '>>>' : '   ';
    result.push(`${marker} ${i + 1}: ${lines[i]}`);
  }
  return { lineNum, context: result.join('\n') };
}

// Generate a diff of what changed
function makeDiff(oldContent, newContent, changeOffset) {
  const oldLines = oldContent.split(/\r?\n/);
  const newLines = newContent.split(/\r?\n/);
  const oldLineNum = offsetToLine(oldContent, changeOffset);

  let startChanged = oldLineNum - 1;

  // Find the first line that differs
  let endOld = startChanged;
  let endNew = startChanged;

  // Skip forward to find matching lines (handle insertions, deletions, and modifications)
  // Strategy: find the shortest range where old[startChanged..endOld) maps to new[startChanged..endNew)
  // by looking for the next line that matches between old and new after the change region
  
  // First, find how many old lines and new lines are in the changed region
  // by searching for a matching anchor line after the change
  let bestMatch = -1;
  for (let i = startChanged + 1; i < oldLines.length && i < startChanged + 50; i++) {
    // Look for oldLines[i] in newLines starting from startChanged
    for (let j = startChanged; j < newLines.length && j < startChanged + 50; j++) {
      if (oldLines[i] === newLines[j] && oldLines[i].trim().length > 0) {
        // Found a match: old[i] == new[j]
        // Changed region is old[startChanged..i) -> new[startChanged..j)
        endOld = i;
        endNew = j;
        bestMatch = i;
        break;
      }
    }
    if (bestMatch !== -1) break;
  }
  
  // Fallback: if no match found, use old approach (limited to 30 lines)
  if (bestMatch === -1) {
    endOld = startChanged;
    endNew = startChanged;
    while (endOld < oldLines.length && endNew < newLines.length && endOld < startChanged + 30) {
      if (oldLines[endOld] === newLines[endNew]) break;
      endOld++;
      endNew++;
    }
  }

  // Show 1 line before and 1 line after for context
  const before = Math.max(0, startChanged - 1);
  const afterOld = Math.min(oldLines.length, endOld + 1);
  const afterNew = Math.min(newLines.length, endNew + 1);

  const diff = [];
  // Context before
  for (let i = before; i < startChanged; i++) {
    if (i < oldLines.length) diff.push(`   ${i + 1}: ${oldLines[i]}`);
  }
  // Removed lines
  for (let i = startChanged; i < endOld; i++) {
    if (i < oldLines.length) diff.push(`-  ${i + 1}: ${oldLines[i]}`);
  }
  // Added lines
  for (let i = startChanged; i < endNew; i++) {
    if (i < newLines.length) diff.push(`+  ${i + 1}: ${newLines[i]}`);
  }
  // Context after
  for (let i = endOld; i < afterOld; i++) {
    if (i < oldLines.length && i - startChanged + (endNew - endOld) < newLines.length) {
      const newIdx = i - startChanged + (endNew - endOld) + startChanged;
      if (newIdx < newLines.length && oldLines[i] === newLines[newIdx]) {
        diff.push(`   ${i + 1}: ${oldLines[i]}`);
      }
    }
  }

  return diff.join('\n');
}

/**
 * Smart patch with auto-anchor, fuzzy matching, context, and diff.
 *
 * @param {string} filePath - absolute path
 * @param {string} anchor - string to find (auto-shortened if long)
 * @param {string} insertion - what to insert/replace with
 * @param {string} mode - 'after' | 'before' | 'replace' | 'replace-line'
 * @param {object} opts - { preview: bool, fuzzy: bool }
 * @returns {object} { ok, message, diff, context }
 */
function patch(filePath, anchor, insertion, mode, opts) {
  opts = opts || {};
  const content = fs.readFileSync(filePath, 'utf8');
  const root = opts.root || path.dirname(filePath);

  // --- replace-line mode ---
  if (mode === 'replace-line') {
    const lines = content.split(/\r?\n/);
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(anchor)) matches.push(i);
    }
    if (matches.length === 0) {
      let bestLine = -1;
      let bestSim = 0;
      for (let i = 0; i < lines.length; i++) {
        const sim = 1 - levenshtein(lines[i], anchor) / Math.max(lines[i].length, anchor.length);
        if (sim > bestSim) { bestSim = sim; bestLine = i; }
      }
      if (bestLine >= 0 && bestSim > 0.5) {
        const lineOffset = content.split(/\r?\n/).slice(0, bestLine).join('\n').length + 1;
        const ctxResult = getContext(content, lineOffset, 3, 3);
        return {
          ok: false,
          message: `anchor not found. Closest match (line ${bestLine + 1}, ${Math.round(bestSim * 100)}% similar):`,
          context: ctxResult.context,
          suggestion: `Try: lex patch replace-line "${lines[bestLine].trim().slice(0, 40)}"`,
        };
      }
      return { ok: false, message: 'anchor not found', context: null };
    }
    if (matches.length > 1) {
      const ctxLines = matches.slice(0, 5).map(m => `   ${m + 1}: ${lines[m]}`).join('\n');
      return {
        ok: false,
        message: `anchor matches ${matches.length} lines. Make it more specific:`,
        context: ctxLines,
      };
    }
    const matched = matches[0];
    const oldLine = lines[matched];
    const newLines = [...lines];
    newLines[matched] = insertion;
    const result = newLines.join('\n');
    const lineOffset = content.split(/\r?\n/).slice(0, matched).join('\n').length + 1;

    if (opts.preview) {
      return {
        ok: true,
        message: `preview: would replace line ${matched + 1}`,
        diff: `-  ${matched + 1}: ${oldLine}\n+  ${matched + 1}: ${insertion}`,
        context: getContext(content, lineOffset, 2, 2).context,
      };
    }

    // Auto-backup
    const trashDir2 = path.join(root, '.lex', 'trash');
    fs.mkdirSync(trashDir2, { recursive: true });
    const ts2 = Date.now();
    const backupName2 = ts2 + '_' + path.relative(root, filePath).replace(/[\\/]/g, '__');
    fs.copyFileSync(filePath, path.join(trashDir2, backupName2));

    fs.writeFileSync(filePath, result);
    return {
      ok: true,
      message: `replaced line ${matched + 1}`,
      diff: `-  ${matched + 1}: ${oldLine}\n+  ${matched + 1}: ${insertion}`,
      context: getContext(result, lineOffset, 2, 2).context,
      backup: '.lex/trash/' + backupName2,
    };
  }

  // --- string-based modes ---

  // Step 1: Try exact match
  let idx = content.indexOf(anchor);
  let usedAnchor = anchor;
  let autoAnchored = false;

  // Step 2: Auto-anchor - find shortest unique substring
  // Only try if anchor is long enough, and verify the match is actually similar
  if (idx === -1 && anchor.length > 20) {
    const auto = shortestUniqueSubstring(content, anchor);
    if (auto) {
      // Verify: the matched region in content should be similar to the anchor
      // Extract the content around the match for comparison
      const matchRegion = content.slice(Math.max(0, auto.offset - 5), auto.offset + auto.substring.length + 5);
      const similarity = 1 - levenshtein(matchRegion, anchor.slice(0, matchRegion.length)) / Math.max(matchRegion.length, anchor.length);
      if (similarity > 0.7) {
        usedAnchor = auto.substring;
        idx = auto.offset;
        autoAnchored = true;
      }
    }
  }

  // Step 3: Fuzzy match
  if (idx === -1 && opts.fuzzy !== false) {
    const closest = findClosestMatch(content, anchor);
    if (closest && closest.similarity > 60) {
      const ctx = getContext(content, closest.offset, 3, 3);
      return {
        ok: false,
        message: `anchor not found. Closest match (${closest.similarity}% similar) at line ${offsetToLine(content, closest.offset)}:`,
        context: ctx.context,
        suggestion: `Use a shorter or more exact anchor from the context above.`,
      };
    }
    return { ok: false, message: 'anchor not found', context: null };
  }

  if (idx === -1) return { ok: false, message: 'anchor not found', context: null };

  // Step 4: Check uniqueness, try auto-anchor if multiple matches
  let secondIdx = content.indexOf(usedAnchor, idx + 1);
  if (secondIdx !== -1 && !autoAnchored && anchor.length > 5) {
    const auto = shortestUniqueSubstring(content, anchor);
    if (auto) {
      usedAnchor = auto.substring;
      idx = auto.offset;
      autoAnchored = true;
      secondIdx = content.indexOf(usedAnchor, idx + 1);
    }
  }

  // Step 4b: If still multiple matches, allow targeting by occurrence or line
  if (secondIdx !== -1) {
    // Collect all match positions
    const allMatches = [];
    let searchFrom = 0;
 while (true) {
      const pos = content.indexOf(usedAnchor, searchFrom);
      if (pos === -1) break;
      allMatches.push(pos);
      searchFrom = pos + 1;
    }

    // If occurrence is specified, use that match (1-based)
    if (opts.occurrence && opts.occurrence >= 1 && opts.occurrence <= allMatches.length) {
      idx = allMatches[opts.occurrence - 1];
      secondIdx = -1; // resolved
    } else if (opts.line) {
      // Find the match closest to the requested line
      let bestMatch = allMatches[0];
      let bestDist = Infinity;
      for (const m of allMatches) {
        const d = Math.abs(offsetToLine(content, m) - opts.line);
        if (d < bestDist) { bestDist = d; bestMatch = m; }
      }
      idx = bestMatch;
      secondIdx = -1; // resolved
    } else {
      // Show all matches with context so agent can pick occurrence
      const ctxParts = allMatches.slice(0, 5).map((m, i) => {
        const ctx = getContext(content, m, 2, 2);
        return `Match ${i + 1} (line ${offsetToLine(content, m)}):\n${ctx.context}`;
      });
      let msg = `anchor matches ${allMatches.length} locations.`;
      if (allMatches.length <= 5) {
        msg += ' Add "occurrence": N to target a specific match.';
      } else {
        msg += ` Showing first 5. Add "occurrence": N (1-${allMatches.length}) to target a specific match.`;
      }
      msg += ' Or add "line": N to target by line number.';
      return {
        ok: false,
        message: msg,
        context: ctxParts.join('\n\n'),
        matches: allMatches.map((m, i) => ({ occurrence: i + 1, line: offsetToLine(content, m) })),
      };
    }
  }

  // Step 5: Apply
  let anchorEnd = idx + usedAnchor.length;
  let replaceStart = idx;

  // When auto-anchored with replace mode, expand to cover the full original anchor
  if (autoAnchored && mode === 'replace') {
    // The auto-anchor found a unique substring at idx. Try to extend backward
    // and forward to cover as much of the original anchor as exists in content.
    const autoSub = usedAnchor;
    const autoStartInAnchor = anchor.indexOf(autoSub);
    
    // Extend backward: match chars before the auto-substring
    let backExt = 0;
    for (let b = 1; b <= autoStartInAnchor; b++) {
      if (idx - b >= 0 && content[idx - b] === anchor[autoStartInAnchor - b]) {
        backExt = b;
      } else break;
    }
    
    // Extend forward: match chars after the auto-substring
    const afterAutoInAnchor = autoStartInAnchor + autoSub.length;
    let fwdExt = 0;
    for (let f = 0; f < anchor.length - afterAutoInAnchor; f++) {
      if (anchorEnd + f < content.length && content[anchorEnd + f] === anchor[afterAutoInAnchor + f]) {
        fwdExt = f + 1;
      } else break;
    }
    
    replaceStart = idx - backExt;
    anchorEnd = anchorEnd + fwdExt;
  }

  let result;
  let changeOffset;

  if (mode === 'after') {
    result = content.slice(0, anchorEnd) + insertion + content.slice(anchorEnd);
    changeOffset = anchorEnd;
  } else if (mode === 'before') {
    result = content.slice(0, idx) + insertion + content.slice(idx);
    changeOffset = idx;
  } else if (mode === 'replace') {
    result = content.slice(0, replaceStart) + insertion + content.slice(anchorEnd);
    changeOffset = replaceStart;
  } else if (mode === 'delete') {
    // Remove the anchor text. Optionally also remove trailing newline if anchor was on its own line.
    let delStart = replaceStart;
    let delEnd = anchorEnd;
    // If the anchor is the only thing on its line, remove the whole line including newline
    const lineStart = content.lastIndexOf('\n', delStart - 1) + 1;
    const lineEnd = content.indexOf('\n', delEnd);
    const lineContent = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);
    if (lineContent.trim() === usedAnchor.trim()) {
      // Anchor is the only content on this line - remove entire line
      delStart = lineStart;
      delEnd = lineEnd === -1 ? content.length : lineEnd + 1;
    }
    result = content.slice(0, delStart) + content.slice(delEnd);
    changeOffset = delStart;
  } else {
    return { ok: false, message: 'mode must be: after, before, replace, replace-line, or delete' };
  }

  // Step 6: Auto-backup to .lex/trash/ before writing
  const trashDir = path.join(root, '.lex', 'trash');
  fs.mkdirSync(trashDir, { recursive: true });
  const ts = Date.now();
  const backupName = ts + '_' + path.relative(root, filePath).replace(/[\\/]/g, '__');
  const backupPath = path.join(trashDir, backupName);
  fs.copyFileSync(filePath, backupPath);

  // Step 7: Diff + context
  const diff = makeDiff(content, result, changeOffset);
  const ctx = getContext(result, changeOffset, 2, 2);

  if (opts.preview) {
    // Don't write or backup in preview mode
    fs.unlinkSync(backupPath);
    return {
      ok: true,
      message: `preview: would patch at line ${offsetToLine(content, idx)}${autoAnchored ? ' (auto-anchored)' : ''}`,
      diff,
      context: ctx.context,
    };
  }

  fs.writeFileSync(filePath, result);
  return {
    ok: true,
    message: `patched at line ${offsetToLine(content, idx)}${autoAnchored ? ' (auto-anchored)' : ''}`,
    diff,
    context: ctx.context,
    bytesChanged: result.length - content.length,
    backup: '.lex/trash/' + backupName,
  };
}

function patchMulti(filePath, patches, opts) {
  let applied = 0;
  for (const p of patches) {
    const r = patch(filePath, p.anchor, p.insertion || '', p.mode || 'after', opts);
    if (!r.ok) return { ok: false, applied, message: `patch ${applied + 1} failed: ${r.message}`, context: r.context, diff: r.diff };
    applied++;
  }
  return { ok: true, applied, message: `applied ${applied} patches` };
}

module.exports = { patch, patchMulti, shortestUniqueSubstring, findClosestMatch, levenshtein, renameAll };

// Rename a symbol across a file - find all occurrences of oldName, replace with newName
// Uses word-boundary matching to avoid partial replacements
function renameAll(filePath, oldName, newName, opts) {
  opts = opts || {};
  const root = opts.root || path.dirname(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Build a regex that matches oldName with word boundaries
  // Escape regex special chars in oldName
  const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\b' + escaped + '\\b', 'g');
  
  const matches = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    matches.push({ offset: m.index, line: offsetToLine(content, m.index) });
  }
  
  if (matches.length === 0) {
    return { ok: false, message: `"${oldName}" not found in file` };
  }
  
  // Auto-backup
  const trashDir = path.join(root, '.lex', 'trash');
  fs.mkdirSync(trashDir, { recursive: true });
  const ts = Date.now();
  const backupName = ts + '_' + path.relative(root, filePath).replace(/[\\/]/g, '__');
  fs.copyFileSync(filePath, path.join(trashDir, backupName));
  
  const result = content.replace(re, newName);
  
  if (opts.preview) {
    return {
      ok: true,
      message: `preview: would rename ${matches.length} occurrences of "${oldName}" to "${newName}"`,
      matches: matches,
    };
  }
  
  fs.writeFileSync(filePath, result);
  
  // Build diff from first match
  const diff = makeDiff(content, result, matches[0].offset);
  const ctx = getContext(result, matches[0].offset, 2, 2);
  
  return {
    ok: true,
    message: `renamed ${matches.length} occurrences of "${oldName}" -> "${newName}"`,
    diff,
    context: ctx.context,
    matches: matches,
    backup: '.lex/trash/' + backupName,
  };
}
