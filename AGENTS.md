# lex - Universal Coding Companion

This plugin provides reasoning, efficient code, design intelligence, project memory, and crash recovery.

On session start, read `skills/using-lex/SKILL.md` for the full protocol. All other skills are in `skills/` and invoked on demand by reading their SKILL.md.

## MANDATORY session start (every time, no exceptions)

1. Read `.lex/status.md` - know where the project stands
2. Check if `.lex/wip.md` exists - if yes, another agent was interrupted. Read it. Resume or ask the user.
3. Scan `.lex/INDEX.md` - know what knowledge exists. Do NOT load all pages.

## MANDATORY before any task

1. Create `.lex/wip.md` with the plan and steps. This is NOT optional. If you start a task without wip.md, crash recovery is impossible.
2. Update wip.md after every significant step (file written, test run, decision made).
3. Append to `.lex/audit.log`: `YYYY-MM-DD HH:MM | agent | platform | action | target`

## Search the index, NOT the filesystem

Before grep-ing or reading whole files, use the lex index (zero tokens, instant):

```
node bin/lex.js search <terms>     # find where something is (returns lines, not files)
node bin/lex.js symbols <file>     # see what's in a file without reading it
node bin/lex.js links <route>      # find route + every frontend consumer
node bin/lex.js refs <symbol>      # find all references to a function/class/variable
node bin/lex.js status             # one-command health check (files, wip, guard)
node bin/lex.js diff               # what files changed since last index
node bin/lex.js docs <term>        # search distilled API docs cache
node bin/lex.js guard              # scan for exposed secrets + DB anti-patterns
node bin/lex.js check              # pre-flight: wip.md exists, index fresh, no guard violations
node bin/lex.js tokens             # session token usage (sent/received, files read/written)
```

Do NOT grep the whole project and read 500-line files when one `lex search` gives you the 10 lines you need. The index is the shared brain. Use it.

## Gateway: use lex WITHOUT running commands

You can use lex search, symbols, patch, grep, refs, undo, and more **without `run_command`**.
Write a request to `.lex/in/` using `write_to_file` - the PostToolUse hook processes it
automatically and injects the result into your context as additionalContext.

Three input formats (all work, pick the lightest):

```
# 1. Empty file = no-arg command (filename IS the command, 21% less overhead)
write_to_file('.lex/in/errors.json', '', true)   # → {cmd:"errors",args:[]}

# 2. Plain text = cmd + args (17% less overhead than JSON)
write_to_file('.lex/in/r.json', 'search ValidationError')           # → {cmd:"search",args:["ValidationError"]}
write_to_file('.lex/in/r.json', 'grep res\\.status|src/app.js')     # → {cmd:"grep",args:["res\\.status","src/app.js"]}

# 3. JSON = full control (backward compatible)
write_to_file('.lex/in/req.json', '{"cmd":"search","args":["InputError"]}')
```

The result appears in your context immediately. No commands, no PowerShell quoting, no approval.

### Available commands

| cmd | args | example |
|-----|------|---------|
| `search` | `["terms"]` | `{"cmd":"search","args":["InputError"]}` |
| `symbols` | `["file.js"]` | `{"cmd":"symbols","args":["src/app.js"]}` |
| `grep` | `["pattern","file?"]` | `{"cmd":"grep","args":["res\\.status","src/app.js"]}` |
| `read` | `["file","start-end?"]` | `{"cmd":"read","args":["src/app.js","10-20"]}` |
| `patch` | `{file,anchor,insertion,mode}` | `{"cmd":"patch","args":{"file":"src/app.js","anchor":"const x=1","insertion":"const y=2;","mode":"after"}}` |
| `insert` | `{file,after?,before?,line}` | `{"cmd":"insert","args":{"file":"src/app.js","after":"const x=1","line":"const y=2;"}}` |
| `rename` | `{file?,from,to}` | `{"cmd":"rename","args":{"from":"oldName","to":"newName"}}` (omit `file` for multi-file) |
| `delete` | `["file"]` | `{"cmd":"delete","args":["src/old.js"]}` (safe delete to .lex/trash/) |
| `batch` | `[cmd1,cmd2,...]` | `{"cmd":"batch","args":[{"cmd":"search","args":["err"]},{"cmd":"symbols","args":["src/app.js"]}]}` |
| `diff` | `[]` | `{"cmd":"diff","args":[]}` |
| `errors` | `[]` | `{"cmd":"errors","args":[]}` |
| `links` | `["/api/users"?]` | `{"cmd":"links","args":["/api/users"]}` (omit arg for all) |
| `undo` | `[]` | `{"cmd":"undo","args":[]}` |
| `snapshot` | `["save","file1","file2"]` | `{"cmd":"snapshot","args":["save","src/app.js"]}` |
| `refs` | `["symbol"]` | `{"cmd":"refs","args":["InputError"]}` |
| `recent` | `[limit]` | `{"cmd":"recent","args":[10]}` |
| `guard` | `[]` | `{"cmd":"guard","args":[]}` |

### Patch modes: `after`, `before`, `replace`, `replace-line`, `delete`, `preview`

Patch returns diff + context. Auto-backup to `.lex/trash/` before writing. Use `undo` to revert.

- **`delete`**: removes the anchor (no insertion needed). If anchor is the only thing on its line, removes the whole line.
- **`rename`**: word-boundary find-replace across entire file. Use for renaming functions, variables, classes.

**Non-unique anchors**: If anchor matches multiple locations, patch shows all matches with numbered context. Add `"occurrence": N` to target match #N, or `"line": N` to target by line number.

```json
{"cmd":"patch","args":{"file":"src/app.js","anchor":"catch (e) {","insertion":"// handler","mode":"after","occurrence":2}}
```

**Short anchors**: Anchors as short as 5 chars work if they're unique. Use longer anchors (20+ chars) for best results.

**Batch mode**: Send multiple commands in one request to save the ~58 token per-call overhead. Results are separated by `---`.

```json
{"cmd":"batch","args":[{"cmd":"search","args":["InputError"]},{"cmd":"symbols","args":["src/app.js"]}]}
```

**Diff**: Shows files changed since last `lex refresh` (modified, added, deleted). Use before committing.

## MANDATORY after completing work

1. Delete `.lex/wip.md`
2. Rewrite `.lex/status.md` with current state (~30 lines max)
3. Append session summary to `.lex/sessions/YYYY-MM-DD.md`
4. Extract learnings to `pages/mistakes.md`, `pages/patterns.md`, or `pages/design.md`
5. Run `node bin/lex.js guard` before committing - never commit exposed secrets

## Enforcement (hooks enforce, instructions suggest)

- PostToolUse hook WARNS you if you edit without wip.md - you WILL see the warning.
- PostToolUse hook AUTO-LOGS every edit to audit.log - no manual logging needed.
- Git pre-commit hook runs `lex guard` and BLOCKS commits with CRITICAL violations.
- `.lex/agent.json` controls enforcement rules. Run `lex check` before starting work.
