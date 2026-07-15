---
name: performance
description: Profile, benchmark, and optimize code. Use when the user reports slowness, when optimizing hot paths, or when designing for scale. Measure before optimizing.
argument-hint: "[area to optimize]"
---

# Performance

Measure first. Optimize second. Never optimize on intuition.

<HARD-GATE>
No optimization without a measurement showing the problem. "Feels slow" is not a measurement.
</HARD-GATE>

## Process

1. **Measure** - profile the actual bottleneck. Use the right tool:
   - Node.js: `--prof`, `--cpu-prof`, `clinic.js`
   - PHP: Xdebug profiler, Blackfire, Telescope
   - Python: `cProfile`, `py-spy`, `line_profiler`
   - Rust: `cargo flamegraph`, `perf`
   - Go: `pprof`, `go test -bench`
   - Browser: DevTools Performance tab, Lighthouse
2. **Identify** - find the top 3 hot spots. 80/20 rule
3. **Hypothesize** - write down expected improvement before changing
4. **Optimize** - one change at a time
5. **Re-measure** - confirm improvement. Revert if no gain
6. **Document** - record what worked in `pages/patterns.md`

## Common Bottlenecks

| Layer | Symptom | Fix |
|-------|---------|-----|
| Database | N+1 queries | Eager load, batch fetch |
| Database | Missing index | Add index, verify with EXPLAIN |
| Memory | Large allocations | Stream, paginate, lazy load |
| CPU | Tight loops | Algorithm change, caching |
| Network | Too many requests | Batch, combine, CDN |
| Render | Layout thrash | Debounce, virtual scroll, CSS containment |
| I/O | Sync file reads | Async streams, buffering |

## Optimization Ladder

1. **Algorithm** - O(n^2) to O(n log n) beats any micro-optimization
2. **Data structure** - right structure makes algorithm obvious
3. **Caching** - don't recompute what doesn't change
4. **Batching** - reduce round trips
5. **Parallelism** - independent work in parallel
6. **Micro** - only if still slow after all above

## Rules

- Never optimize without profiling evidence
- One change at a time, re-measure after each
- Check `.lex/pages/mistakes.md` for past optimization failures
- Document the before/after numbers
- Premature optimization is the root of evil. But measured optimization is engineering
- Watch for regression: add a benchmark test that fails if performance degrades
