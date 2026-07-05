---
name: code-review
description: Review code for correctness, security, and quality. Use after writing or modifying code, and before merging. Catches bugs, security issues, and style problems.
argument-hint: "[low|medium|high]"
---

# Code Review

Review code with technical rigor. Not performative agreement.

## Effort Levels

- **low/medium**: High-confidence findings only. Real bugs, security holes, correctness issues
- **high**: Broader coverage. Style, efficiency, reuse opportunities. May include uncertain findings

## What to Check

1. **Correctness** - does the code do what it claims? Edge cases? Off-by-one? Null handling?
2. **Security** - injection, XSS, CSRF, exposed secrets, unsafe deserialization, auth bypass
3. **Efficiency** - N+1 queries, unnecessary allocations, O(n^2) where O(n) works
4. **Simplification** - can anything be shorter? Can duplicated code be shared? Is there a stdlib alternative?
5. **Consistency** - does it match project patterns? Check `.ctx/pages/patterns.md`
6. **Known mistakes** - does this repeat anything from `.ctx/pages/mistakes.md`?

## Output Format

For each finding:
```
[severity] file:line - description
  Why: explanation
  Fix: suggested fix (or "verify manually")
```

Severity: CRITICAL (must fix), IMPORTANT (should fix), MINOR (nice to have)

## Fix-and-Re-Review Loop

CRITICAL and IMPORTANT findings are not suggestions:
1. Fix them
2. Re-review the fix itself (fresh eyes on the fix diff)
3. Repeat until a review pass returns no CRITICAL or IMPORTANT findings
4. Only then report the work as clean

Verify fixes against the actual code, never against the claim that they were fixed.

## Rules

- Technical rigor over politeness. If something is wrong, say so directly
- If feedback seems wrong after investigation, push back. Do not blindly implement suggestions
- Review the actual diff, not what you think changed
- Check `.ctx/pages/mistakes.md` - does this change repeat a known anti-pattern?
