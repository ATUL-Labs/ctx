---
name: refactoring
description: Safely restructure code without changing behavior. Use when cleaning up code, reducing complexity, or improving maintainability. Tests must pass before and after.
argument-hint: "[area to refactor]"
---

# Refactoring

Change the structure without changing the behavior. Tests are the safety net.

<HARD-GATE>
No refactoring without passing tests. If tests don't exist, write characterization tests first. Tests must pass before AND after every step.
</HARD-GATE>

## Process

1. **Verify tests pass** - run the full suite. If any fail, stop
2. **Identify smell** - what's wrong? (duplication, long method, deep nesting, etc.)
3. **Plan steps** - small, safe transformations. One at a time
4. **Refactor** - one step, run tests, commit
5. **Repeat** - until the smell is gone
6. **Verify** - full suite passes, no behavior change

## Safe Transformations (in order of safety)

1. **Extract function** - move code into a named function. Tests still pass
2. **Rename** - better names. Tests still pass
3. **Move** - relocate code to better home. Tests still pass
4. **Extract class/module** - group related functions. Tests still pass
5. **Replace conditional with polymorphism** - only when conditionals are the smell
6. **Simplify** - remove dead code, merge duplicates. Tests still pass

## Code Smells

| Smell | Signal | First step |
|-------|--------|------------|
| Long method | > 30 lines | Extract function |
| Deep nesting | > 3 levels | Guard clauses, early return |
| Duplication | Same logic in 2+ places | Extract shared function |
| Large class | > 200 lines | Extract class |
| Long parameter list | > 4 params | Group into object |
| Feature envy | Method uses another class more | Move method |
| Primitive obsession | String/int where a type belongs | Value object |

## Rules

- One transformation per commit. If tests fail, revert immediately
- Never refactor and fix bugs in the same commit
- Check `.lex/pages/patterns.md` for project conventions before restructuring
- Don't refactor working code that's about to be replaced. Delete it instead
- Keep public API stable. Internal restructuring is safe, interface changes are not
- If the refactor is > 100 lines of diff, break it into smaller steps
