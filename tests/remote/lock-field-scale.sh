#!/usr/bin/env bash
# Keep four wide DTOs below a lowered budget, with exact whole-record bytes.
set -euo pipefail
cd "$(dirname "$0")/../.."
repo=$PWD
source_root=${LOCK_FIELD_SOURCE_ROOT:-$repo}
ablac=$(realpath -s "${ABLAC:-../ablac/build/ablac}")
mkdir -p build
work=$(mktemp -d "$repo/build/lock-field-scale.XXXXXXXX")
finish() { local status=$?; if ((status==0)); then rm -rf -- "$work"; else printf 'field-scale evidence: %s\n' "$work" >&2; fi; }
trap finish EXIT
cp -R "$source_root/src" "$work/src"
mkdir "$work/app"
cp "$repo/tests/remote/app/abla.toml" "$work/app/abla.toml"
export ABLA_CACHE_DIR="$work/cache"
{
    for ((kind=0;kind<4;kind++)); do
        printf 'class Wide%d(' "$kind"
        for ((field=0;field<512;field++)); do
            if ((field>0)); then printf ', '; fi
            printf 'val field%04d: int' "$field"
        done
        printf ')\n'
    done
    cat <<'AB'
@server
fun wide(a: Wide0, b: Wide1, c: Wide2, d: Wide3): Wide0 = a
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
    for ((kind=0;kind<4;kind++)); do
        printf 'class Wide%d' "$kind"
        for ((field=0;field<512;field++)); do printf '|field%04d: int' "$field"; done
        printf '\n'
    done
    printf 'route wide(a: Wide0, b: Wide1, c: Wide2, d: Wide3) -> Wide0\n'
} | LC_ALL=C sort > "$work/expected.lock"
cp "$work/expected.lock" "$work/app/canonical.lock"
tac "$work/expected.lock" > "$work/app/reverse.lock"
(cd "$work/app" && ABLA_EVAL_STEP_LIMIT=8000000 "$ablac" build server.ab -o "$work/probe" --fast --no-cache) > "$work/compiler.log" 2>&1 || { cat "$work/compiler.log"; exit 1; }
cmp "$work/expected.lock" "$work/app/canonical.lock"
cmp "$work/expected.lock" "$work/app/reverse.lock"
printf 'ok four DTOs with 512 fields retain exact bytes in both orders below 8000000 steps\n'
printf 'PASS server-lock wide field scaling\n'
