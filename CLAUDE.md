# lex - Universal Coding Companion

This plugin provides reasoning, efficient code, design intelligence, project memory, and crash recovery.

On session start, the `using-lex` skill is injected automatically via hooks. All other skills are invoked on demand.

When the user types `/lex`, invoke the Skill tool with `skill: "using-lex"` before doing anything else.

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

Do NOT grep the whole project and read 500-line files when one `lex search` gives you the 10 lines you need. The index is the shared brain. Use it.

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
- `.lex/agent.json` controls enforcement rules. Run `lex check` before starting work.
