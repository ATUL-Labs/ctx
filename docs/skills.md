# Skills

24 skills, each a standalone `SKILL.md` that any agent can read. Each skill has a `HARD-GATE` - written answers required before proceeding. No gate, no code.

## Skill catalog

| Skill | Trigger | Purpose |
|-------|---------|---------|
| **using-lex** | Auto (session start) | Bootstrap - protocol, skill index, rules |
| **brainstorming** | "let's build", "add feature" | Explore ideas before building |
| **planning** | After brainstorming | Break specs into executable tasks |
| **executing** | After planning | Work through plans with checkpoints |
| **tdd** | Before implementation | Red-green-refactor |
| **debugging** | Bug, test failure | Systematic root-cause analysis |
| **verification** | Before claiming "done" | Prove work is complete with evidence |
| **code-review** | After writing code | Quality, security, correctness review |
| **efficient-code** | Always active | YAGNI, shortest diff, no bloat |
| **design-intelligence** | Any UI/frontend work | Mobile-first, content-before-theme, SEO + GEO, shock-not-boring |
| **docs-cache** | Session start | Global distilled API docs, version-verified |
| **subagent-dispatch** | 2+ independent tasks | Parallel agent execution |
| **finishing-branch** | Before merge/PR | PR creation, merge, cleanup |
| **context-health** | Init, maintenance | Manage `.lex/`, compress, prevent overflow |
| **security** | Any code, any file | Always active - never expose secrets |
| **database-architecture** | Designing schema | Right-size tables, read/write tradeoffs, no EAV |
| **api-design** | Creating endpoints, API contracts | REST/GraphQL conventions, error format, versioning |
| **performance** | Profiling, optimizing | Measure first, optimize hot paths, benchmark |
| **refactoring** | Restructuring code | Safe transformations, tests as safety net |
| **git-workflow** | Branching, merging, conflicts | Clean history, safe rebase, conflict resolution |
| **error-handling** | Error paths, retry logic | Right layer, meaningful messages, no swallowing |
| **logging** | Structured logging | Log levels, correlation IDs, what to log/not log |
| **caching** | Cache layers, invalidation | TTL vs event-driven, cache key design, hit rate |
| **accessibility** | UI accessibility, WCAG | Keyboard nav, screen reader, contrast, ARIA |

## Stack overlays

`lex init` auto-detects your stack and loads matching overlays alongside each skill:

| Overlay | Languages | What it adds |
|---------|-----------|--------------|
| **php** | PHP, Laravel, Symfony | Xdebug/Telescope, Pest/PHPUnit, mass assignment checks, N+1 detection |
| **rust** | Rust | `dbg!`/clippy/miri, `#[test]` patterns, `unsafe` audits, borrow check review |
| **python** | Python, Django, FastAPI | pdb/breakpoint, pytest fixtures, mutable default arg checks |
| **typescript** | TS, React, Next.js, Vue | devtools, Vitest/Jest, `any`/`as` review, async correctness |
| **go** | Go | delve, table-driven tests, goroutine leak checks, `err` handling review |

~30-50 lines each, loaded on-demand only when the skill fires.
