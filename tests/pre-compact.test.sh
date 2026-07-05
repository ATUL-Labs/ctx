#!/usr/bin/env bash
# Tests for hooks/pre-compact. Run: bash tests/pre-compact.test.sh
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK="$PLUGIN_ROOT/hooks/pre-compact"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "ok   - $1"; }
fail() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

# Fixture 1: project with .ctx - appends audit line, outputs JSON
TMP="$(mktemp -d)"
mkdir -p "$TMP/.ctx"
OUT="$(cd "$TMP" && bash "$HOOK")"
grep -q "PreCompact | context compaction" "$TMP/.ctx/audit.log" 2>/dev/null \
  && ok "appends audit.log entry" || fail "appends audit.log entry"
[ "$OUT" = "{}" ] && ok "outputs empty JSON" || fail "outputs empty JSON (got: $OUT)"

# Fixture 2: appending twice keeps both lines (append-only)
(cd "$TMP" && bash "$HOOK" > /dev/null)
LINES=$(grep -c "PreCompact" "$TMP/.ctx/audit.log")
[ "$LINES" -eq 2 ] && ok "append-only (2 entries after 2 runs)" || fail "append-only (got $LINES)"

# Fixture 3: project without .ctx - no file created, still valid JSON, exit 0
TMP2="$(mktemp -d)"
OUT2="$(cd "$TMP2" && bash "$HOOK")"; RC=$?
[ "$RC" -eq 0 ] && ok "exit 0 without .ctx" || fail "exit 0 without .ctx"
[ ! -e "$TMP2/.ctx" ] && ok "does not create .ctx" || fail "does not create .ctx"
[ "$OUT2" = "{}" ] && ok "valid JSON without .ctx" || fail "valid JSON without .ctx"

rm -rf "$TMP" "$TMP2"
echo "---"; echo "pass=$PASS fail=$FAIL"
[ "$FAIL" -eq 0 ]
