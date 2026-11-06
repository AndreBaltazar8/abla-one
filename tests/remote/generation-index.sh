#!/usr/bin/env bash
# Indexed and legacy caches must emit identical declarations in discovery order.
set -euo pipefail
cd "$(dirname "$0")/../.."
repo=$PWD
ablac=$(realpath -s "${ABLAC:-../ablac/build/ablac}")
mkdir -p build
work=$(mktemp -d "$repo/build/generation-index.XXXXXXXX")
finish() { local status=$?; if ((status==0)); then rm -rf -- "$work"; else printf 'generation-index evidence: %s\n' "$work" >&2; fi; }
trap finish EXIT
cp -R src "$work/src"
mkdir "$work/app"
cp tests/remote/app/abla.toml "$work/app/abla.toml"
export ABLA_CACHE_DIR="$work/cache"
for ((i=0;i<80;i++)); do
    printf 'class Data%04d(val id: int, val labels: array<string>)\n@server\nfun route%04d(value: Data%04d): Data%04d = value\n' "$i" "$i" "$i" "$i" > "$work/app/m$i.ab"
    printf 'import "m%d.ab" as mod%d\n' "$i" "$i"
done > "$work/app/server.ab"
for ((i=0;i<4;i++)); do printf 'import contract "m%d.ab" as client%d\n' "$i" "$i"; done >> "$work/app/server.ab"
cat >> "$work/app/server.ab" <<'AB'
import "../src/server/remote.ab"
#compilerGrant("filesystem.write")
compile fun equalCacheStrings(left: array<string>, right: array<string>): bool {
    if (left.size != right.size) return false
    var index = 0
    while (index < left.size) {
        if (left[index] != right[index]) return false
        index = index + 1
    }
    true
}
compile fun verifyCaches(): void {
    val modules: array<string> = []
    val prefixes: array<string> = []
    val functions: array<int> = []
    for (function in compilerContractFunctionsAnnotated("server")) functions.append(function)
    for (function in compiler.functionsAnnotated("server")) functions.append(function)
    for (function in functions) {
        val module = compiler.functionModuleIdentity(function)
        var known = false
        for (old in modules) if (old == module) known = true
        if (!known) { modules.append(module); prefixes.append(oneRemoteModulePrefix(module)) }
    }
    var legacy = OneRemoteSource("", [], [], prefixes, [], [], [])
    var indexed = OneRemoteSource("", [], [], oneRemotePrefixes(), [], [], [], indexed = true)
    oneRemoteWriteClients(legacy); oneRemoteWriteRoutes(legacy)
    oneRemoteWriteClients(indexed); oneRemoteWriteRoutes(indexed)
    var same = legacy.code == indexed.code
    same = same && equalCacheStrings(legacy.parts, indexed.parts)
    same = same && equalCacheStrings(legacy.seen, indexed.seen)
    same = same && equalCacheStrings(legacy.classes, indexed.classes)
    same = same && equalCacheStrings(legacy.spellings, indexed.spellings)
    same = same && equalCacheStrings(legacy.prefixes, indexed.prefixes)
    same = same && legacy.problems.size == 0 && indexed.problems.size == 0
    // Legacy/manual sources still observe direct mutation of their arrays.
    var manual = OneRemoteSource("", ["old"], [], [], ["Before"], ["first"], [])
    manual.classes[0] = "After"; manual.spellings[0] = "changed"
    manual.seen[0] = "changed"
    same = same && oneRemoteClassName(manual, "After") == "changed"
    same = same && oneRemoteRemember(manual, "old")
    same = same && !oneRemoteRemember(manual, "changed")
    if (!same) compiler.generateModule("cache_parity_error", "fun cacheParityError(): void { GENERATED_BYTES_OR_LEGACY_CACHE_CHANGED() }\n")
    compiler.writeFile("result.txt", "indexed and legacy generation match across 80 aliased modules, clients, codecs, validators and discovery order\n")
    return
}
#compiler.transform(verifyCaches)
fun main: int = 0
AB
(cd "$work/app" && "$ablac" build server.ab -o "$work/probe" --fast --no-cache) > "$work/compiler.log" 2>&1 || { cat "$work/compiler.log"; exit 1; }
grep -Fqx 'indexed and legacy generation match across 80 aliased modules, clients, codecs, validators and discovery order' "$work/app/result.txt"
cat "$work/app/result.txt"
printf 'PASS indexed remote generation parity\n'
