#!/usr/bin/env bash
# Field membership must preserve ABI compatibility on both sides of the cutoff.
set -euo pipefail
cd "$(dirname "$0")/../.."
repo=$PWD
ablac=$(realpath -s "${ABLAC:-../ablac/build/ablac}")
mkdir -p build
work=$(mktemp -d "$repo/build/lock-wide-fields.XXXXXXXX")
finish() { local status=$?; if ((status==0)); then rm -rf -- "$work"; else printf 'wide-field evidence: %s\n' "$work" >&2; fi; }
trap finish EXIT
cp -R src "$work/src"
mkdir "$work/app"
cp tests/remote/app/abla.toml "$work/app/abla.toml"
export ABLA_CACHE_DIR="$work/cache"
source_file() {
    local fields=$1 first_type=${2:-int} extra=${3:-0}
    {
        printf 'class Wide(\n'
        for ((i=0;i<fields;i++)); do
            kind=int
            if ((i==0)); then kind=$first_type; fi
            printf '    val field%04d: %s' "$i" "$kind"
            if ((i+1<fields || extra)); then printf ','; fi
            printf '\n'
        done
        if ((extra)); then printf '    val extra: string?\n'; fi
        cat <<'AB'
)
@server
fun wide(value: Wide): Wide = value
import "../src/server/lock.ab"
#compilerGrant("filesystem.read")
#compilerGrant("filesystem.write")
compile fun record(): void { oneServerLock("server.lock"); return }
#compiler.transform(record)
fun main: int = 0
AB
    } > "$work/app/server.ab"
}
expected_file() {
    local fields=$1 extra=${2:-0}
    {
        printf 'class Wide'
        for ((i=0;i<fields;i++)); do printf '|field%04d: int' "$i"; done
        if ((extra)); then printf '|extra: string?'; fi
        printf '\nroute wide(value: Wide) -> Wide\n'
    } > "$work/expected.lock"
}
build() { (cd "$work/app" && "$ablac" build server.ab -o "$work/probe" --fast --no-cache) > "$work/compiler.log" 2>&1; }
for fields in 64 65 128; do
    rm -f "$work/app/server.lock"
    source_file "$fields"
    expected_file "$fields"
    build || { cat "$work/compiler.log"; exit 1; }
    cmp "$work/expected.lock" "$work/app/server.lock"
    tac "$work/expected.lock" > "$work/app/server.lock"
    build || { cat "$work/compiler.log"; exit 1; }
    cmp "$work/expected.lock" "$work/app/server.lock"
    source_file "$fields" bool
    if build; then echo 'FAIL changed wide field was accepted' >&2; exit 1; fi
    grep -Fq 'server_lock__class_Wide__field_field0000__int_was_changed_or_removed' "$work/compiler.log"
    cmp "$work/expected.lock" "$work/app/server.lock"
    source_file "$fields" int 1
    expected_file "$fields" 1
    build || { cat "$work/compiler.log"; exit 1; }
    cmp "$work/expected.lock" "$work/app/server.lock"
    printf 'ok %s fields: reverse input, changed-type refusal and optional append preserve exact ABI order\n' "$fields"
done
printf 'PASS server-lock wide field compatibility\n'
