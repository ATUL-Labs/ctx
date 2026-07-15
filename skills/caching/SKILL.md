---
name: caching
description: Design caching strategies. Use when adding cache layers, optimizing repeated computations, or reducing database load. Ensures caches are invalided correctly.
argument-hint: "[cache scenario]"
---

# Caching

Cache to avoid recomputation. Invalidate to avoid staleness. Get both right.

<HARD-GATE>
No cache without an invalidation strategy. A cache you can't invalidate is a bug waiting to happen.
</HARD-GATE>

## Cache Layers

| Layer | What | TTL | Invalidation |
|-------|------|-----|--------------|
| Browser | Static assets, API responses | Long (1yr for assets) | Cache busting (filename hash) |
| CDN | HTML, images, API responses | Medium (minutes) | Purge on deploy/update |
| Application | Computed results, DB queries | Short (seconds-minutes) | Event-driven (write invalidates) |
| Database | Query results, prepared plans | DB-managed | Automatic |
| In-memory | Hot data, session state | Process lifetime | LRU eviction, manual clear |

## When to Cache

- Same computation runs > 10x/second
- Result changes infrequently relative to read frequency
- Computation is expensive (DB query, API call, complex calculation)
- Stale data is acceptable for the TTL window

## When NOT to Cache

- Data changes on every read
- Stale data causes correctness issues (financial, medical)
- The computation is cheap (< 1ms)
- You can't define an invalidation strategy

## Invalidation Strategies

1. **TTL** - simplest. Set a time, let it expire. Good for data that changes predictably
2. **Write-through** - update cache on write. Always consistent, adds write latency
3. **Write-behind** - update cache, async update DB. Fast writes, risk of data loss
4. **Event-driven** - listen for changes, invalidate affected keys. Most accurate
5. **Versioned** - cache key includes a version. Bump version on change. Simple and safe

## Cache Key Design

```
// Good: specific, namespaced, versioned
cache:user:42:profile:v3
cache:api:products:category:electronics:page:1

// Bad: ambiguous, collision-prone
user_data
products
```

## Rules

- Check `.lex/pages/patterns.md` for existing cache patterns
- Always set a max size on in-memory caches (LRU eviction)
- Monitor cache hit rate. Below 80% means the cache strategy is wrong
- Never cache auth tokens or sensitive data without encryption
- Test cache invalidation: write a test that fails if stale data is served
- Document the invalidation strategy in the code, not just in your head
