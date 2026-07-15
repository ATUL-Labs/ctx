---
name: git-workflow
description: Manage branches, merges, conflicts, and history. Use when creating branches, resolving conflicts, rebasing, or cleaning up git history.
argument-hint: "[git operation]"
---

# Git Workflow

Keep history clean, branches short-lived, and merges safe.

## Branching

- **Feature branch** - `feature/description` or `feat/description`
- **Bug fix** - `fix/description` or `bugfix/description`
- **Hotfix** - `hotfix/description` (from main, merge back to main and release)
- **Release** - `release/vX.Y.Z` (for staging before release)

## Commit Hygiene

- One logical change per commit
- Imperative mood: "Add user validation" not "Added user validation"
- Subject under 50 chars, body wraps at 72
- If you need "and" in the subject, it's two commits
- Squash WIP commits before merging to main

## Merging

1. **Rebase** feature branch onto latest main (keeps history linear)
2. **Resolve conflicts** - one file at a time, understand both sides
3. **Test** - run full suite after merge
4. **Squash merge** to main if branch has noise commits
5. **Delete** the feature branch after merge

## Conflict Resolution

```
1. Read both sides: git log --merge, git diff
2. Understand WHY each side made its change
3. Combine intentionally, not just "pick mine" or "pick theirs"
4. Test the merged result
5. Commit with a clear message: "Merge: resolve X between A and B"
```

## Rebase Safety

- Never rebase shared branches (main, develop, release)
- Rebase only your own feature branches
- If unsure, merge instead of rebase
- After rebase, force-push only your own branch: `git push --force-with-lease`

## Rules

- Check `.lex/pages/patterns.md` for project-specific git conventions
- Never commit to main directly (unless solo project with no CI)
- Always pull before push: `git pull --rebase origin main`
- Tag releases: `git tag v0.1.20 -m "description"`
- Keep `.gitignore` updated - never commit `.env`, `node_modules/`, build artifacts
