# Benchmarks

Tested on two repos - a small one (88 files) and a large production codebase (45,213 files).

## Speed (FTS query only, no Node startup)

| Repo size | Query | lex search | grep (walk + read all) | Faster |
|-----------|-------|-----------|--------------------------|--------|
| 88 files | `loadAgentConfig` (rare) | 1.0ms | 8.6ms | 8.6x |
| 88 files | `function` (common) | 1.8ms | 9.0ms | 5.1x |
| 45K files | `GenerateSitemap` (rare) | 5.4ms | 30,631ms | 5,672x |
| 45K files | `ocr` (common) | 5.5ms | 10,667ms | 1,939x |

## Token savings (what the agent receives)

| Repo size | Query | lex output | grep output | Tokens saved |
|-----------|-------|-----------|-------------|-------------|
| 88 files | `function` | ~248 tokens | ~4,880 tokens | 95% |
| 45K files | `GenerateSitemap` | ~71 tokens | ~1,492 tokens | 95% |
| 45K files | `ocr` | ~224 tokens | ~6,751,649 tokens | 100% |

grep returns every matching line from every file. lex returns one snippet per file with
line numbers. On a 45K-file repo, a common query like `ocr` would flood the agent's
entire context window with 6.7M tokens of noise. lex returns 224.

## shouldRefresh cache

Search skips the filesystem walk if the index was refreshed in the last 30 seconds.
Saves ~41ms per search on small repos, ~200ms+ on large ones.

## Server mode (`lex watch`)

When the persistent server is running, `lex search` routes through it via HTTP instead
of starting a new Node process. This cuts latency from ~200ms (Node startup + DB open)
to **~15ms** (HTTP roundtrip). The server also watches files for changes and re-indexes
them in real-time, so the index is always fresh without any refresh call.

## Fuzzy search

`lex search` supports prefix matching and typo tolerance.
`loadAgent` matches `loadAgentConfig`. `loadAgnt` (missing 'e') still finds results
via progressive prefix shortening.

## Gateway token overhead

Three input formats with measured overhead (tokens = chars / 4):

| Format | Example | Tokens | vs JSON |
|--------|---------|--------|---------|
| JSON (no-arg) | `{"cmd":"errors","args":[]}` | 53 | base |
| Empty file | `.lex/in/errors.json` (empty) | 45 | **-15%** |
| JSON (1-arg) | `{"cmd":"search","args":["ValidationError"]}` | 58 | base |
| Plain text | `search ValidationError` | 48 | **-17%** |
| JSON (2-arg) | `{"cmd":"grep","args":["res\\.status","src/app.js"]}` | 61 | base |
| Pipe text | `grep res\.status\|src/app.js` | 50 | **-18%** |

## Batch amortization

| Approach | Tokens |
|----------|--------|
| 2 separate calls | 89 |
| 1 batch call | 68 |
| **Saved** | **21 (24%)** |

## Gateway vs run_command

The gateway costs ~20 more raw tokens per call (write_to_file has more JSON fields),
but eliminates non-token costs that matter more in practice:

| Metric | Gateway (`write_to_file`) | CLI (`run_command`) |
|--------|--------------------------|---------------------|
| Token overhead | 42-50 tokens | 24-28 tokens |
| User approval | **Never** | Every call |
| Shell quoting | None | Required (PowerShell) |
| Output injection | Auto (`additionalContext`) | Manual (read stdout) |
| Batch support | Yes (1 call, N commands) | No (N calls) |

On a typical session with 20 lex commands, that's **20 approvals saved** at the cost
of ~400 extra tokens. The approval friction is the real bottleneck — each approval
interrupts the user's flow and adds latency.

## Diff memory optimization (v0.1.14)

The `diff` command was rewritten to load FTS content only for modified files instead
of all indexed files. Two-pass approach: first detect modified files by mtime/size,
then load content via `WHERE path IN (...)`.

| Project size | Old diff | New diff | Improvement |
|-------------|----------|----------|-------------|
| 88 files | loads 88 rows | loads ~3 rows | ~29x |
| 106 files | loads 106 rows (426 KB) | loads ~5 rows (~20 KB) | ~21x |
| 45K files | loads 45K rows (~180 MB) | loads ~10 rows (~40 KB) | ~4,500x |

## Test suite (v0.1.15)

| Suite | Tests | Status |
|-------|-------|--------|
| Core (`node --test`) | 51 | all pass |
| Browser audit (`node --test`) | 13 | all pass |
| Gateway commands | 15 | all pass |
| Input formats | 11 | all pass |
| Error capture | 7 | all pass (with server) |
| **Total** | **97** | **0 failures** |

Run all tests:
```bash
node --test tests/cli.test.js tests/indexer.test.js tests/init.test.js tests/serve.test.js tests/extract.test.js tests/test-audit.js
node tests/test-gateway.js
node tests/test-formats.js
node tests/test-errors.js
```
