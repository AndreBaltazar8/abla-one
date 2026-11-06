#!/usr/bin/env bash
# Preserve first-insertion prefix lookup while bounding ordered index growth.
set -euo pipefail
cd "$(dirname "$0")/../.."
repo=$PWD
ablac=$(realpath -s "${ABLAC:-../ablac/build/ablac}")
mkdir -p build
work=$(mktemp -d "$repo/build/lock-index.XXXXXXXX")
failed=1
finish() { if [[ $failed == 0 ]]; then rm -rf -- "$work"; else printf 'lock-index evidence: %s\n' "$work" >&2; fi; }
trap finish EXIT
cp -R "$repo/src" "$work/src"
mkdir "$work/app"
cp "$repo/tests/remote/app/abla.toml" "$work/app/abla.toml"
cat > "$work/app/server.ab" <<'AB'
import "../src/server/lock.ab"
#compilerGrant("filesystem.read")
#compilerGrant("filesystem.write")
compile fun verifyIndex(index: OneLockIndex, var problems: array<string>): void {
    var node = 0
    while (node < index.keys.size) {
        val left = oneLockIndexHeight(index, index.left[node])
        val right = oneLockIndexHeight(index, index.right[node])
        if (left - right > 1 || right - left > 1 || index.height[node] != 1 + (if (left > right) left else right)) problems.append("index is not balanced")
        var first = node
        if (index.left[node] >= 0 && index.first[index.left[node]] < first) first = index.first[index.left[node]]
        if (index.right[node] >= 0 && index.first[index.right[node]] < first) first = index.first[index.right[node]]
        if (first != index.first[node]) problems.append("oldest record changed")
        node = node + 1
    }
    return
}
compile fun probe(lines: array<string>, var problems: array<string>): int {
    val index = OneLockIndex()
    val prefix: array<string> = []
    var checks = 0
    for (line in lines) {
        var existed = false
        for (old in prefix) if (old == line) existed = true
        if (oneLockRemember(index, line) == existed) problems.append("duplicate insertion changed")
        if (!oneLockKnown(index, line)) problems.append("inserted key is not known")
        prefix.append(line)
        val bulk = oneLockIndexOf(prefix)
        // Retired route membership is exact, unlike ABI record-prefix lookup.
        for (key in ["", "a", "route f()", "route f() -> Result", "class A", "é", "key/0000", "key/0040", "missing key"]) {
            var known = false
            for (old in prefix) if (old == key) known = true
            if (oneLockKnown(index, key) != known) problems.append("exact membership changed")
            if (oneLockKnown(bulk, key) != known) problems.append("bulk exact membership changed")
        }
        for (value in prefix) {
            var length = 0
            while (length <= value.size) {
                val key = value.slice(0, length)
                if (oneLockFindIndexed(index, key) != oneLockFind(prefix, key)) problems.append("first prefix changed")
                if (oneLockFindIndexed(bulk, key) != oneLockFind(prefix, key)) problems.append("bulk prefix changed")
                checks = checks + 1
                length = length + 1
            }
        }
        if (oneLockFindIndexed(index, "missing key") != "") problems.append("missing key matched")
        if (oneLockKnown(index, "missing key")) problems.append("missing exact key matched")
    }
    verifyIndex(index, problems)
    // The writer bulk-builds retained routes, then inserts newly discovered
    // routes. Exercise that transition too, including existing/duplicate keys.
    val mixed = oneLockIndexOf(prefix)
    for (line in ["late", "key/0010", "route f() -> R", "class Late", "é", ""]) {
        var existed = false
        for (old in prefix) if (old == line) existed = true
        if (oneLockRemember(mixed, line) == existed) problems.append("bulk insertion changed")
        if (!oneLockKnown(mixed, line)) problems.append("bulk insertion is not known")
        prefix.append(line)
        for (value in prefix) {
            var length = 0
            while (length <= value.size) {
                val key = value.slice(0, length)
                if (oneLockFindIndexed(mixed, key) != oneLockFind(prefix, key)) problems.append("bulk insertion prefix changed")
                checks = checks + 1
                length = length + 1
            }
        }
        verifyIndex(mixed, problems)
    }
    checks
}
compile fun run(): void {
    val problems: array<string> = []
    var checks = probe(["route f() -> Result", "route f() -> R", "route f() -> Result", "class Z|value: int", "class A|value: string", "class Aa|value: bool", "é", "", "a", "ab", "aé"], problems)
    checks = checks + probe(["aé", "ab", "a", "", "é", "class Aa|value: bool", "class A|value: string", "class Z|value: int", "route f() -> Result", "route f() -> R", "route f() -> Result"], problems)
    val ascending: array<string> = []
    val descending: array<string> = []
AB
for ((i=0;i<40;i++)); do printf '    ascending.append("key/%04d")\n' "$i" >> "$work/app/server.ab"; done
for ((i=39;i>=0;i--)); do printf '    descending.append("key/%04d")\n' "$i" >> "$work/app/server.ab"; done
cat >> "$work/app/server.ab" <<'AB'
    checks = checks + probe(ascending, problems)
    checks = checks + probe(descending, problems)
    if (problems.size > 0) compiler.generateModule("lock_index_failure", "fun failedLockIndex(): void { first_prefix_or_balance_changed() }\n")
    compiler.writeFile("result.txt", "$checks prefix comparisons; exact membership, balance and first-insertion checks passed\n")
    return
}
#compiler.transform(run)
fun main: int = 0
AB
(cd "$work/app" && "$ablac" build server.ab -o "$work/probe" --fast --no-cache) > "$work/compiler.log" 2>&1 || { cat "$work/compiler.log"; exit 1; }
grep -Eq '^[0-9]+ prefix comparisons; exact membership, balance and first-insertion checks passed$' "$work/app/result.txt"
cat "$work/app/result.txt"
failed=0
