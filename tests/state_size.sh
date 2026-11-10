#!/usr/bin/env bash
# A State read costs what a field read costs: abla-one's State is abla-ui's plain one (a bare
# load; a write bumps the revision). Two programs, the same but for `by State(...)` on 80 fields
# read 400 times, optimized, ablac 0.2.48: the State one is 5,016 bytes bigger, at NovaKind's pin
# and now (setters and constructors; reads cost nothing). With a State that does work on a read
# (abla-ui's tracked one, before it was renamed Tracked) it was 58,168 bytes bigger. The bound,
# 12 KB, lets the first through and stops the second.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$root"
for name in state_fields plain_fields; do "$ABLAC" build "tests/size/$name.ab" -o "$work/$name"; done
grown=$(($(stat -c %s "$work/state_fields") - $(stat -c %s "$work/plain_fields")))
if [ "$grown" -le 12288 ]; then echo "ok   80 State fields read 400 times cost $grown bytes over plain fields"; else echo "FAIL 80 State fields read 400 times cost $grown bytes over plain fields: is a State read more than a load?"; exit 1; fi
