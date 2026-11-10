#!/usr/bin/env bash
# What `$one` compiles to: every element and attribute form in tests/dsl/trees.ab, rendered for
# three targets and dumped by the test backend, must match tests/dsl/trees.txt byte for byte.
# trees.txt was recorded with $one's own parser (before it shared abla-ui's grammar,
# src/grammar.ab there), so this holds the shared grammar to what $one always produced.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$root"
"$ABLAC" build tests/dsl/trees.ab -o "$work/trees" --fast
"$work/trees" > "$work/trees.txt"
if cmp -s "$work/trees.txt" tests/dsl/trees.txt; then echo "ok   \$one's trees, $(wc -l < tests/dsl/trees.txt) lines, as recorded"; else echo "FAIL \$one's trees differ from tests/dsl/trees.txt:"; diff tests/dsl/trees.txt "$work/trees.txt" | head -20; exit 1; fi
