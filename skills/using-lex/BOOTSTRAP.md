# lex - Universal Coding Companion (Condensed Bootstrap)

You have lex installed. Full protocol: read `.lex/skills/using-lex/SKILL.md` when needed.
This file is injected on session start to save context. The full SKILL.md has details.

## MANDATORY session start

1. Read `.lex/status.md` - know where the project stands
2. Check if `.lex/wip.md` exists - if yes, another agent was interrupted. Read it. Resume or ask the user.
3. Scan `.lex/INDEX.md` - know what knowledge exists. Do NOT load all pages.

## MANDATORY before any task

1. Create `.lex/wip.md` with the plan and steps. NOT optional. Crash recovery depends on it.
2. Update wip.md after every significant step (file written, test run, decision made).
3. Append to `.lex/audit.log`: `YYYY-MM-DD HH:MM | agent | platform | action | target`

## Search the index, NOT the filesystem (CRITICAL)

Before grep-ing or reading whole files, use the lex index (zero tokens, instant):

```
lex search <terms>     # find where something is (returns lines, not files)
lex symbols <file>     # see what's in a file without reading it
lex links <route>      # find route + every frontend consumer
lex refs <symbol>      # find all references to a function/class/variable
lex status             # one-command health check (files, wip, guard)
lex diff               # what files changed since last index
lex docs <term>        # search distilled API docs cache
lex guard              # scan for exposed secrets + DB anti-patterns
lex check              # pre-flight: wip.md exists, index fresh, no guard violations
lex tokens             # session token usage (sent/received, files read/written)
```

Do NOT grep the whole project and read 500-line files when one `lex search` gives you the 10 lines you need.

## MANDATORY after completing work

1. Delete `.lex/wip.md`
2. Rewrite `.lex/status.md` with current state (~30 lines max)
3. Append session summary to `.lex/sessions/YYYY-MM-DD.md`
4. Extract learnings to `pages/mistakes.md`, `pages/patterns.md`, or `pages/design.md`
5. Run `lex guard` before committing - never commit exposed secrets

## Enforcement (hooks enforce, instructions suggest)

- PostToolUse hook WARNS you if you edit without wip.md - you WILL see the warning.
- PostToolUse hook AUTO-LOGS every edit to audit.log - no manual logging needed.
- Git pre-commit hook runs `lex guard` and BLOCKS commits with CRITICAL violations.
- `.lex/agent.json` controls enforcement: { require_wip, auto_audit_log, warn_no_wip_on_edit, block_commit_on_critical }.
- Run `lex check` before starting work - exits 1 if rules are violated.

## Non-negotiables

- NEVER skip `.lex/` updates after work. The next agent depends on it.
- NEVER leave `wip.md` after completing work. Delete it.
- NEVER use em dashes. Hyphens (-) only.
- NEVER write API keys, passwords, tokens, or connection strings inline in code.
- ALWAYS check wip.md on session start. Crash recovery is not optional.
- ALWAYS log to audit.log. The trail is how we know who did what.
- ALWAYS run `lex check` before starting work. Fix failures before proceeding.

## Skills

24 skills available. Read `.lex/skills/<skill-name>/SKILL.md` when the task matches:
brainstorming, planning, executing, tdd, debugging, docs-cache, verification,
code-review, efficient-code, security, design-intelligence, database-architecture,
subagent-dispatch, finishing-branch, context-health, api-design, performance,
refactoring, git-workflow, error-handling, logging, caching, accessibility.

Stack overlays exist for: php, rust, python, typescript, go.
