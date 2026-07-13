# Upgrading

lex is designed so upgrades never lose data. Your `.lex/` folder, knowledge pages,
session summaries, audit log, and SQLite index all survive every upgrade.

## Quick upgrade (any platform)

```bash
# Update the plugin
claude plugin update github:ATUL-Labs/lex    # Claude Code
codex plugin update github:ATUL-Labs/lex     # Codex
gemini extensions update github:ATUL-Labs/lex # Gemini CLI
```

For Cursor / Windsurf / any agent: pull the latest `skills/`, `hooks/`, `lib/`, and
`bin/` from the repo. Your `.lex/` folder is never touched.

That's it. No migration, no reinit, no data loss.

## What's safe across versions

| Artifact | Location | Upgraded? | Your data |
|----------|----------|-----------|-----------|
| `.lex/status.md` | Your project | No | **Preserved** |
| `.lex/wip.md` | Your project | No | **Preserved** |
| `.lex/INDEX.md` | Your project | No | **Preserved** |
| `.lex/audit.log` | Your project | No | **Preserved** |
| `.lex/pages/*` | Your project | No | **Preserved** |
| `.lex/sessions/*` | Your project | No | **Preserved** |
| `.lex/agent.json` | Your project | No | **Preserved** |
| `.lex/token-ledger.json` | Your project | No | **Preserved** |
| `.lex/index.db` | Your project | No | **Preserved** (schema is forward-compatible) |
| `skills/` | Plugin repo | Yes | N/A (replaced) |
| `hooks/` | Plugin repo | Yes | N/A (replaced) |
| `lib/` | Plugin repo | Yes | N/A (replaced) |
| `bin/` | Plugin repo | Yes | N/A (replaced) |

**Key principle:** lex never writes to your project files except inside `.lex/`.
Upgrading replaces the plugin code (`skills/`, `hooks/`, `lib/`, `bin/`) and leaves
your project's `.lex/` folder completely untouched.

## What's in git vs gitignored

`lex init` automatically adds these to `.gitignore`:

```
.lex/index.db*        # SQLite index (cache, rebuilt from source)
.lex/live.json        # Live activity marker (ephemeral)
.lex/token-ledger.json  # Session token tracking (ephemeral)
.lex/trash/           # Deleted file backups (ephemeral)
.lex/snapshots/       # File snapshots (ephemeral)
.lex/in/              # Gateway request queue (ephemeral)
.lex/out/             # Gateway response queue (ephemeral)
.lex/server.json      # Server port info (ephemeral)
.env                  # Secrets
.env.*                # Secrets
!.env.example         # Keep example files
!.env.template        # Keep template files
```

**What IS tracked in git** (and should be):
- `.lex/status.md` — project state
- `.lex/INDEX.md` — knowledge table of contents
- `.lex/wip.md` — work-in-progress (tracked until task completes, then deleted)
- `.lex/audit.log` — agent activity trail
- `.lex/agent.json` — enforcement config
- `.lex/pages/*` — knowledge pages (stack, run, mistakes, patterns, design, rules)
- `.lex/sessions/*` — conversation summaries

**Plugin files** (`skills/`, `hooks/`, `lib/`, `bin/`) are only in your project
if you used the per-project drop-in install method. With plugin install
(`claude plugin install`), they live in the plugin directory and never touch
your project repo.

When using drop-in install, `lex init` automatically detects plugin dirs at the
project root and adds them to `.lex/ignore` — so they don't show up in search
results, file counts, the link graph, or the viewer. The indexer skips them
entirely.

## SQLite index compatibility

The SQLite index uses `CREATE TABLE IF NOT EXISTS` for all tables. New versions
that add tables or columns won't break existing indexes — the new tables are
created on first use, and existing tables keep their data.

If you ever need a clean reindex (e.g. after a major extraction logic update):

```bash
node bin/lex.js refresh    # incremental — only reindexes changed files
```

Or for a full rebuild:

```bash
rm .lex/index.db          # safe — it's a cache, regenerated from your source files
node bin/lex.js refresh   # rebuilds from scratch
```

The index is always a cache of your source files. Deleting it loses nothing —
`lex refresh` rebuilds it.

## Upgrading mid-work (safe)

If you're in the middle of a task and want to upgrade:

1. **Don't delete `wip.md`** — it survives the upgrade
2. Update the plugin (pull latest `skills/`, `hooks/`, `lib/`, `bin/`)
3. Tell your agent: `Continue working. lex was just updated.`
4. The agent reads `.lex/status.md` and `wip.md` and resumes exactly where it left off

No reinit needed. `lex init` is idempotent — it won't overwrite existing `.lex/`
content. Running it after an upgrade is safe but unnecessary unless new template
files were added (it only creates files that don't exist yet).

## Version history

See [CHANGELOG.md](../CHANGELOG.md) for what changed in each version.

### v0.1.13 → v0.1.14

**No data migration needed.** Changes are all in plugin code:

- `gateway.process()` renamed to `gateway.processRequest()` (internal)
- New gateway commands: `links`, `delete` (additive)
- Diff command memory optimization (internal)
- Three gateway input formats (additive — old JSON still works)
- Gateway token tracking (writes to existing `token-ledger.json`)

Your existing `.lex/` folder, index, knowledge pages, and `wip.md` are all
untouched. Just update the plugin files and continue working.
