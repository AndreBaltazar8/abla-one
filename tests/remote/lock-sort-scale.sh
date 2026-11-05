#!/usr/bin/env bash
# Whole-record byte oracle and a lowered step guard for the large lock sort.
set -euo pipefail
cd "$(dirname "$0")/../.."
repo=$PWD
source_root=${LOCK_SOURCE_ROOT:-$repo}
ablac=$(realpath -s "${ABLAC:-../ablac/build/ablac}")
algorithm=${LOCK_SORT_FUNCTION:-oneServerLockSorted}
case $algorithm in oneServerLockSorted|sortedStrings) ;; *) echo 'unsupported sort control' >&2; exit 2 ;; esac
mkdir -p build
work=$(mktemp -d "$repo/build/lock-sort-scale.XXXXXXXX")
failed=0
finish() {
  local status=$?
  if [[ $failed == 0 && $status == 0 ]]; then rm -rf -- "$work"; else printf 'lock-sort-scale evidence: %s\n' "$work" >&2; fi
}
trap finish EXIT
export ABLA_CACHE_DIR="$work/compiler-cache"
cp -R "$source_root/src" "$work/src"
mkdir -p "$work/app"
cp "$repo/tests/remote/app/abla.toml" "$work/app/abla.toml"
if [[ -n ${LOCK_SORT_INPUT:-} ]]; then
  cp -- "$LOCK_SORT_INPUT" "$work/original.lock"
else
  for ((n=0; n<593; n++)); do printf 'class NovaKindRecord%04d|id: string|name: string|values: array<string>|active: bool\n' "$n"; done > "$work/original.lock"
  for ((n=0; n<160; n++)); do printf 'route record%04d(value: NovaKindRecord%04d, limit: int) -> NovaKindRecord%04d\n' "$n" "$n" "$n"; done >> "$work/original.lock"
fi
# The writer retains routes before appending discovered classes. Reverse the
# class group too, so the old insertion sort cannot pass by receiving sorted data.
awk '/^route / { print; next } /^class / { classes[++n]=$0; next } { exit 2 } END { for(i=n;i>0;i--)print classes[i] }' "$work/original.lock" > "$work/app/input.lock"
LC_ALL=C sort "$work/original.lock" > "$work/expected.lock"
cat > "$work/app/server.ab" <<AB
import "../src/server/lock.ab"
import "abla/compiler"
import "abla/fs"
import "abla/text"
#compilerGrant("filesystem.read")
#compilerGrant("filesystem.write")
compile fun sortProbe(): void {
    val sorted = $algorithm(oneLockSplit(Path("input.lock").readText(), 10))
    var output = ""
    for (line in sorted) output = "\$output\$line\\n"
    compiler.writeFile("actual.lock", output)
    val empty = $algorithm([])
    val single = $algorithm(["only"])
    val edges = $algorithm(["x", "", "x", "é", "aa", "a", "z"])
    if (empty.size != 0 || single.size != 1 || single[0] != "only" || edges.size != 7 || edges[0] != "" || edges[1] != "a" || edges[2] != "aa" || edges[3] != "x" || edges[4] != "x" || edges[5] != "z" || edges[6] != "é") {
        compiler.generateModule("lock_sort_probe_failure", "fun lockSortProbeFailure(): void { lock_sort_edges_must_preserve_byte_order_and_duplicates() }\\n")
    }
    return
}
#compiler.transform(sortProbe)
fun main: int = 0
AB
build() {
  (cd "$work/app" && ABLA_EVAL_STEP_LIMIT=10000000 "$ablac" build server.ab -o "$work/server" --fast --no-cache) > "$work/compiler.log" 2>&1 || { cat "$work/compiler.log"; failed=1; exit 1; }
}
build
cmp "$work/expected.lock" "$work/app/actual.lock"
printf 'ok %s whole records match the byte-order oracle under 10000000 steps\n' "$(wc -l < "$work/expected.lock")"
tac "$work/app/input.lock" > "$work/reversed.lock"
mv "$work/reversed.lock" "$work/app/input.lock"
build
cmp "$work/expected.lock" "$work/app/actual.lock"
printf 'ok reversed input has identical bytes; empty, singleton, duplicate and UTF-8 prefix cases pass\n'
printf 'PASS server-lock large sort\n'
