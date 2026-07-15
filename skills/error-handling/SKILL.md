---
name: error-handling
description: Design error handling strategies. Use when implementing error paths, designing exception hierarchies, or adding retry logic. Ensures errors are handled, not swallowed.
argument-hint: "[error scenario]"
---

# Error Handling

Errors are not exceptions. They are information. Handle them at the right layer.

<HARD-GATE>
No error handling code without answering: who catches this, what do they do, what does the user see?
</HARD-GATE>

## Error Categories

| Category | Example | Strategy |
|----------|---------|----------|
| User input | Invalid email, missing field | 422, field-level message |
| Business rule | Insufficient funds, duplicate | 422, domain message |
| Not found | Resource missing | 404, generic message |
| Auth | Not logged in, wrong role | 401/403, redirect |
| Conflict | Concurrent edit, duplicate | 409, retry guidance |
| External | API timeout, DB down | 503, retry with backoff |
| Internal | Unexpected state, bug | 500, log + alert, no details to user |

## Principles

1. **Fail fast** - detect errors at the boundary, not deep in the system
2. **Handle at the right layer** - don't catch what you can't meaningfully handle
3. **Never swallow** - `catch (e) {}` is a bug. At minimum, log it
4. **Meaningful messages** - "Something went wrong" is useless. Be specific but safe
5. **Don't leak internals** - stack traces, SQL errors, file paths stay server-side
6. **Idempotent retries** - if you retry, make sure duplicate execution is safe

## Retry Strategy

```
1. Immediate retry (network blip)
2. Exponential backoff (rate limit, overload)
3. Circuit breaker (persistent failure - stop trying)
4. Dead letter queue (give up, store for manual review)
```

- Max 3 retries for user-facing operations
- Max 5 retries for background jobs
- Jitter backoff to avoid thundering herd

## Logging

- Log the error WITH context: what operation, what input, what state
- Log level: ERROR for failures, WARN for degraded, INFO for retry attempts
- Include a correlation ID for tracing across services
- Never log secrets, tokens, or PII

## Rules

- Check `.lex/pages/patterns.md` for existing error patterns
- User-facing errors: human message + error code
- Internal errors: log everything, show generic message
- Validation errors: list all failures, not just the first
- Async errors: always handle promise rejections, never let them silently drop
- Test error paths: every error branch needs at least one test
