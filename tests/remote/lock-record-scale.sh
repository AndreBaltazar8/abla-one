#!/usr/bin/env bash
# Whole writer cost at fixed-size DTOs, independent of canonical prior order.
set -euo pipefail
cd "$(dirname "$0")/../.."
repo=$PWD
source_root=${LOCK_RECORD_SOURCE_ROOT:-$repo}
ablac=$(realpath -s "${ABLAC:-../ablac/build/ablac}")
mkdir -p build
work=$(mktemp -d "$repo/build/lock-record-scale.XXXXXXXX")
finish() { local status=$?; if ((status==0)); then rm -rf -- "$work"; else printf 'record-scale evidence: %s\n' "$work" >&2; fi; }
trap finish EXIT
cp -R "$source_root/src" "$work/src"
mkdir "$work/app"
cp "$repo/tests/remote/app/abla.toml" "$work/app/abla.toml"
export ABLA_CACHE_DIR="$work/cache"
{
    for ((i=0;i<1024;i++)); do printf 'class Item%04d(val id: string)\n' "$i"; done
    for ((i=0;i<256;i++)); do
        printf '@server\nfun route%04d(a: Item%04d, b: Item%04d, c: Item%04d, d: Item%04d): Item%04d = a\n' "$i" "$((i*4))" "$((i*4+1))" "$((i*4+2))" "$((i*4+3))" "$((i*4))"
    done
    cat <<'AB'
import "../src/server/lock.ab"
#compilerGrant("filesystem.read")
#compilerGrant("filesystem.write")
compile fun canonical(): void { oneServerLock("canonical.lock"); return }
compile fun reverse(): void { oneServerLock("reverse.lock"); return }
#compiler.transform(canonical)
#compiler.transform(reverse)
fun main: int = 0
AB
} > "$work/app/server.ab"
{
    for ((i=0;i<1024;i++)); do printf 'class Item%04d|id: string\n' "$i"; done
    for ((i=0;i<256;i++)); do
        printf 'route route%04d(a: Item%04d, b: Item%04d, c: Item%04d, d: Item%04d) -> Item%04d\n' "$i" "$((i*4))" "$((i*4+1))" "$((i*4+2))" "$((i*4+3))" "$((i*4))"
    done
} | LC_ALL=C sort > "$work/expected.lock"
cp "$work/expected.lock" "$work/app/canonical.lock"
tac "$work/expected.lock" > "$work/app/reverse.lock"
(cd "$work/app" && ABLA_EVAL_STEP_LIMIT=16000000 "$ablac" build server.ab -o "$work/probe" --fast --no-cache) > "$work/compiler.log" 2>&1 || { cat "$work/compiler.log"; exit 1; }
cmp "$work/expected.lock" "$work/app/canonical.lock"
cmp "$work/expected.lock" "$work/app/reverse.lock"
printf 'ok 1280 records retain exact bytes in both orders below 16000000 steps\n'
printf 'PASS server-lock record scaling\n'
