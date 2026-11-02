#!/usr/bin/env bash
# What a layout feature costs a program that doesn't use it: nothing. Wrapping rows and scrollRow are only reached from what makes them
# (the hooks in src/layout/layout.ab), so each must add several KB to a program that makes one, and a program that doesn't keeps none of it.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$root"
for name in plain wrap scroll_row; do "$ABLAC" build "tests/size/$name.ab" -o "$work/$name"; done
plain=$(stat -c %s "$work/plain")
failed=0
for name in wrap scroll_row; do
  grown=$(($(stat -c %s "$work/$name") - plain))
  if [ "$grown" -ge 2000 ]; then echo "ok   $name adds $grown bytes to a program that makes one"; else echo "FAIL $name adds $grown bytes: is its code in every program?"; failed=1; fi
done

# And what reaches a row without those calls.
run() { "$ABLAC" build "tests/rows/$1.ab" -o "$work/$1" && "$work/$1" 2>&1; }
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got [$2], wanted [$3]"; failed=1; fi; }
check 'by hand: laid out as a plain row, and it says so' "$(run hand_written | sort -u)" 'one: plain row: make it with Style.wrap() or scrollRow()'
check 'in the markup: wraps' "$(run dsl_wrap)" 'height 40'
check 'on a thin device: both, from the server' "$(run thin_tree)" 'height 40 across 160'
exit $failed
