#!/usr/bin/env bash
# NovaKind's own screens under two revisions of abla-one, from a NovaKind worktree (never its
# main checkout): the landing and pricing pages (tools/claro_landing_preview.ab), the signed-in
# previews (tools/claro_preview.ab), every preview screen's layout boxes node by node at
# 360/411/1024/1280/1920 in both languages for the android and desktop targets (boxes.ab here,
# copied into the worktree's tools/ as ui_check_boxes.ab), and tests/native-render.ab against
# its goldens. Each is built with `novakind-tool pinned-build` at ABLA_ONE_REV=<rev> through
# NovaKind's compiler-slot and compared file for file with the same from <base>.
#   tools/ui-check/novakind.sh <novakind worktree> <rev> [<base>, default NovaKind's pin file]
# The worktree needs `make tool` done once. abla-ui: add its line to the worktree's
# toolchain/sibling-revisions so the build takes a fixed commit (the script prints what is there).
# Results are kept in $STORE/novakind/<abla-one commit>/ and reused (FORCE=1 rebuilds).
set -uo pipefail
{
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(dirname -- "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)")
nk=$(cd -- "${1:?a NovaKind worktree}" && pwd); rev=${2:?a revision}
base=${3:-$(cat "$nk/toolchain/abla-one-revision")}
store=${STORE:-$HOME/.cache/abla-one-ui-check}/novakind
slot=$nk/tools/compiler-slot
[ -x "$nk/build/novakind-tool" ] || { echo "no build/novakind-tool in $nk: run make tool there (through its compiler-slot)" >&2; exit 2; }
case $nk in */.claude/worktrees/*) ;; *) echo "$nk is not a worktree under .claude/worktrees: not running in a main checkout" >&2; exit 2 ;; esac
cp "$here/boxes.ab" "$nk/tools/ui_check_boxes.ab"

take() {
	local commit out
	commit=$(git -C "$repo" rev-parse --verify "$1^{commit}") || return 2
	out=$store/$commit
	if [ -f "$out/DONE" ] && [ "${FORCE:-}" != 1 ]; then echo "$out"; return 0; fi
	rm -rf "$out"; mkdir -p "$out"
	(
		cd "$nk" || exit 2
		{ echo "abla-one $commit"; echo "novakind $(git rev-parse HEAD)"; grep '^abla-ui ' toolchain/sibling-revisions || echo "abla-ui: not pinned in toolchain/sibling-revisions (the live checkout is used)"; echo "load $(cut -d' ' -f1-3 /proc/loadavg)"; } > "$out/ABOUT"
		# The signed-in previews and the app itself first: NovaKind must compile unchanged (2c's requirement), so fail fast there.
		for program in tools/claro_preview app tools/claro_landing_preview tools/ui_check_boxes tests/native-render; do
			name=$(basename "$program")
			ABLA_ONE_REV=$commit ABLA_ONE_REPO=$repo "$slot" nix-shell toolchain/shell.nix --run "build/novakind-tool pinned-build $program.ab -o build/ui-check-$name --fast" > "$out/$name.build.log" 2>&1 || { echo "$program does not build against $1: $(grep -c '^error' "$out/$name.build.log") errors, the first:" >&2; grep -m 3 -A 3 '^error' "$out/$name.build.log" >&2; exit 2; }
			echo "$name $(stat -c %s "build/ui-check-$name")" >> "$out/SIZES"
		done
		rm -rf build/claro-landing build/claro-preview build/ui-check-boxes
		./build/ui-check-claro_landing_preview > /dev/null 2>&1 && ./build/ui-check-claro_preview > /dev/null 2>&1 && ./build/ui-check-ui_check_boxes > /dev/null 2>&1 || { echo "a preview program failed against $1" >&2; exit 2; }
		cp -r build/claro-landing build/claro-preview build/ui-check-boxes "$out/"
		./build/ui-check-native-render > "$out/native-render.txt" 2>&1; echo "exit $?" >> "$out/native-render.txt"
		# What rendering the 300 preview pages costs: wall time, and instructions where perf is to be had; 5 runs, the load beside them.
		for run in 1 2 3 4 5; do
			start=$(date +%s%N)
			if command -v perf > /dev/null 2>&1; then instructions=$(perf stat -x, -e instructions:u ./build/ui-check-claro_preview 2>&1 > /dev/null | grep instructions | cut -d, -f1); else ./build/ui-check-claro_preview > /dev/null 2>&1; instructions=-; fi
			echo "run $run: $(( ($(date +%s%N) - start) / 1000000 )) ms, instructions ${instructions:--}, load $(cut -d' ' -f1 /proc/loadavg)" >> "$out/COST"
		done
	) || return 2
	touch "$out/DONE"
	echo "$out"
}

was=$(take "$base") || exit 2
now=$(take "$rev") || exit 2
cat "$now/ABOUT"
failed=0
for set in claro-landing claro-preview ui-check-boxes; do
	differing=0; first=""
	for file in "$was/$set"/*; do
		name=$(basename "$file")
		cmp -s "$file" "$now/$set/$name" || { differing=$((differing + 1)); [ -n "$first" ] || first=$name; }
	done
	bytes=$(cat "$was/$set"/* | wc -c)
	if [ $differing = 0 ]; then echo "same    $set: $(ls "$was/$set" | wc -l) files, $bytes bytes"; else
		failed=1
		echo "DIFFERS $set: $differing of $(ls "$was/$set" | wc -l) files ($bytes bytes compared), the first $first:"
		diff <(tr '>' '>\n' < "$was/$set/$first") <(tr '>' '>\n' < "$now/$set/$first" 2>/dev/null) | head -4 | cut -c1-220 | sed 's/^/          /'
	fi
done
if [ "$(tail -2 "$now/native-render.txt")" = "$(tail -2 "$was/native-render.txt")" ] && tail -1 "$now/native-render.txt" | grep -q 'exit 0'; then echo "same    native-render: $(tail -2 "$now/native-render.txt" | head -1), goldens $(cat "$nk/tests/native-render.golden" "$nk/tests/native-render-pay.golden" | wc -c) bytes"
else failed=1; echo "DIFFERS native-render: was $(tail -2 "$was/native-render.txt" | tr '\n' ' '), now $(tail -2 "$now/native-render.txt" | tr '\n' ' ')"; grep -m 5 -i 'fail' "$now/native-render.txt" | cut -c1-200 | sed 's/^/          /'; fi
echo "rendering the 300 preview pages, was:"; sed 's/^/  /' "$was/COST" 2>/dev/null; echo "now:"; sed 's/^/  /' "$now/COST" 2>/dev/null
echo "sizes (bytes, --fast)   was → now"; paste "$was/SIZES" "$now/SIZES" | awk '{ printf "  %-24s %9s → %9s (%+d)\n", $1, $2, $4, $4 - $2 }'
[ $failed = 0 ] && echo "novakind: identical" || echo "novakind: NOT identical"
exit $failed
}
