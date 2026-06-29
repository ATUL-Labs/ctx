---
name: verification
description: Verify work before claiming it is done. Use before committing, creating PRs, or telling the user the task is complete. Runs actual verification commands and checks output.
---

# Verification

Evidence before assertions. Run it, check it, then claim it.

## Process

1. **Run tests** - the full test suite, not just the new tests. Check for regressions
2. **Run build** - confirm the project compiles/builds without errors
3. **Check the diff** - review what actually changed. Does it match what was intended?
4. **Manual check** - if it's UI, look at it in a browser. If it's an API, call it. If it's a CLI, run it
5. **Security scan** - no hardcoded secrets, no SQL injection, no XSS, no exposed sensitive data
6. **Context update** - update `.ctx/status.md`, write session summary, clean up `wip.md`

## Rules

- NEVER say "done" or "fixed" or "working" without running verification
- NEVER skip the full test suite - partial runs miss regressions
- NEVER claim a UI change works without seeing it in a browser (or say explicitly that you cannot verify visually)
- If verification fails, fix it before reporting. Do not report partial success as success
- If you cannot verify (no test suite, no browser, no build command), say so explicitly
