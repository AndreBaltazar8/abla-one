#!/usr/bin/env bash
# The same declarations and valid old lock must converge, regardless of discovery order.
set -euo pipefail
cd "$(dirname "$0")/../.."
repo=$PWD
source_root=${LOCK_SOURCE_ROOT:-$repo}
ablac=$(realpath -s "${ABLAC:-../ablac/build/ablac}")
mkdir -p build
work=$(mktemp -d "$repo/build/lock-order.XXXXXXXX")
failed=0
finish() {
  local status=$?
  if [ "$failed" = 0 ] && [ "$status" = 0 ]; then rm -rf -- "$work"; else printf 'lock-order evidence: %s\n' "$work" >&2; fi
}
trap finish EXIT
export ABLA_CACHE_DIR="$work/compiler-cache"
cp -R "$source_root/src" "$work/src"
mkdir -p "$work/app"
cp "$repo/tests/remote/app/abla.toml" "$work/app/abla.toml"
cat > "$work/app/a.ab" <<'AB'
class Alpha(val z: int, val a: string)
@server
fun alpha(value: Alpha): Alpha = value
@server
@retired("use alpha")
fun archived(): int = 0
AB
cat > "$work/app/z.ab" <<'AB'
class Zed(val second: string, val first: array<int>)
@server
fun zeta(value: Zed, limit: int): Zed = value
AB
entry() {
  printf 'import "%s.ab"\nimport "%s.ab"\n' "$1" "$2" > "$work/app/server.ab"
  cat >> "$work/app/server.ab" <<'AB'
import "../src/server/lock.ab"
#compilerGrant("filesystem.read")
#compilerGrant("filesystem.write")
compile fun record(): void { oneServerLock("server.lock"); return }
#compiler.transform(record)
fun main: int = 0
AB
}
build() {
  (cd "$work/app" && "$ablac" build server.ab -o "$work/server" --fast --no-cache) > "$work/compiler.log" 2>&1 || { cat "$work/compiler.log"; failed=1; exit 1; }
}
check() {
  local label=$1
  shift
  if "$@"; then printf 'ok %s\n' "$label"; else printf 'FAIL %s\n' "$label"; failed=1; fi
}
lock="$work/app/server.lock"
entry a z
build
cp "$lock" "$work/first.lock"
check 'first write is byte-sorted' env LC_ALL=C sort -c "$lock"
check 'class field declaration order remains intact' grep -Fqx 'class Alpha|z: int|a: string' "$lock"
check 'route parameter declaration order remains intact' grep -Fqx 'route zeta(value: Zed, limit: int) -> Zed' "$lock"
check 'retired route remains recorded' grep -Fqx 'route archived() -> int' "$lock"
rm "$lock"
entry z a
build
check 'opposite discovery order produces identical bytes' cmp -s "$work/first.lock" "$lock"
tac "$work/first.lock" > "$lock"
build
check 'reversed valid prior lock converges to identical bytes' cmp -s "$work/first.lock" "$lock"
truncate -s -1 "$lock"
build
check 'missing terminal newline converges to canonical bytes' cmp -s "$work/first.lock" "$lock"
printf '\n' >> "$lock"
build
check 'extra blank line converges to canonical bytes' cmp -s "$work/first.lock" "$lock"
touch -d @1000000000 "$lock"
before=$(stat -c '%y:%i' "$lock")
build
check 'canonical lock is not rewritten' test "$(stat -c '%y:%i' "$lock")" = "$before"
sed -i 's/val a: string)/val a: string, val added: string?)/' "$work/app/a.ab"
build
check 'adding a field still passes without reordering fields' grep -Fqx 'class Alpha|z: int|a: string|added: string?' "$lock"
check 'field addition retains canonical record order' env LC_ALL=C sort -c "$lock"
cp "$lock" "$work/extended.lock"
sed -i 's/val z: int/val z: bool/' "$work/app/a.ab"
if (cd "$work/app" && "$ablac" build server.ab -o "$work/server" --fast --no-cache) > "$work/rejected.log" 2>&1; then
  printf 'FAIL changed field must still refuse the build\n'; failed=1
else
  printf 'ok changed field still refuses the build\n'
fi
check 'changed field names the compatibility rule' grep -Fq 'server_lock__class_Alpha__field_z__int_was_changed_or_removed' "$work/rejected.log"
check 'refused compatibility change leaves lock bytes untouched' cmp -s "$work/extended.lock" "$lock"
if [ "$failed" != 0 ]; then exit 1; fi
printf 'PASS server-lock canonical ordering\n'
