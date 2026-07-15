---
name: logging
description: Design structured logging strategies. Use when adding logging to an application, setting up log levels, or debugging via logs. Ensures logs are useful, not noisy.
argument-hint: "[logging area]"
---

# Logging

Logs are for debugging and observability. Structure them. Don't sprinkle them.

## Log Levels

| Level | When to use | Example |
|-------|-------------|---------|
| ERROR | Something failed, user impacted | "Payment failed for order 123" |
| WARN | Degraded but functional, attention needed | "Cache miss rate 80%" |
| INFO | Significant business events | "User 42 registered" |
| DEBUG | Diagnostic detail, off in production | "Query took 230ms" |
| TRACE | Step-by-step execution, very noisy | "Entering validateEmail()" |

## Structured Logging

```
// Good: structured, searchable, filterable
{ "level": "error", "msg": "Payment failed", "orderId": 123, "userId": 42, "amount": 99.00, "error": "card_declined" }

// Bad: unstructured, hard to query
[ERROR] Payment failed for order 123 user 42 amount 99.00 error card_declined
```

## What to Log

- **Always**: errors with full context (operation, input, state, error)
- **Business events**: registration, purchase, login, state transitions
- **Performance**: slow queries (> 100ms), slow requests (> 500ms)
- **Security**: auth failures, permission denials, rate limit hits
- **External calls**: API calls with duration and status

## What NOT to Log

- Passwords, tokens, API keys, connection strings
- PII (emails, phone numbers, SSNs) unless required by compliance
- Full request/response bodies (log a reference, not the content)
- High-frequency noise (every cache hit, every loop iteration)

## Correlation

- Every request gets a unique ID
- Pass it through headers: `X-Request-ID`
- Include it in every log line for that request
- Enables tracing a request across services

## Rules

- Check `.lex/pages/patterns.md` for existing log format
- Log in production at INFO level minimum, DEBUG only when debugging
- Never use `console.log` in production code - use a structured logger
- One log line per event. Don't split one event across multiple lines
- Log the outcome, not the process: "Payment succeeded" not "Starting payment..."
- Include timing: every external call should log duration
