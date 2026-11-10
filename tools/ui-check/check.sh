#!/usr/bin/env bash
# Is a revision of abla-one observably the same as another? (The conversion onto abla-ui must be.)
#   tools/ui-check/check.sh capture <rev>          capture <rev> into the store (the baseline)
#   tools/ui-check/check.sh check <rev> [<base>]   capture <rev> and compare with <base>
#                                                  (default: NovaKind's pin, c1878461)
# A capture exports <rev> (git archive: no checkout or worktree is touched) beside links to
# its sibling repositories (abla-mobile; abla-ui when there is one: ABLA_MOBILE, ABLA_UI name
# them), overlays this directory's capture.ab (so both sides run the same capture), builds with
# the pinned compiler and records, under $STORE/<commit>/:
#   screens/   per screen (the gallery's four routes, the services demo, four stress screens):
#              the web document and web-client document, the test backend's dump for five
#              targets, the Android tree's JSON, and the layout boxes and paint frame for the
#              desktop and epaper targets at 19 widths (either side of every breakpoint used)
#   TESTS      `ablac test` over the Makefile's TESTS, tests/layout_size.sh, tests/thin_config.sh:
#              one line each, ok or FAIL
#   SIZES      bytes of the capture program and of the gallery's web renderer (--fast builds)
#   TIMING     render + layout + paint + document per screen, best of 30, microseconds, with
#              the machine's load beside it (a guide: only a large change means anything)
# `check` prints, per screen, "same" or the first differing file and line, then the tests that
# changed, the sizes and timings side by side. Exit 0 only when every screen file is identical
# and no test went from ok to FAIL.
# ABLAC (default the 0.2.48 install NovaKind pins), NIX (default NovaKind's toolchain shell),
# SLOT (default NovaKind's compiler-slot; SLOT= for none), STORE (default ~/.cache/abla-one-ui-check).
set -uo pipefail
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(git -C "$here" rev-parse --show-toplevel)
ablac=${ABLAC:-$HOME/.local/share/abla/v0.2.48/installed/bin/ablac}
nix=${NIX-nix-shell $HOME/Desktop/projects/novakind/toolchain/shell.nix --run}
slot=${SLOT-$HOME/Desktop/projects/novakind/tools/compiler-slot}
store=${STORE:-$HOME/.cache/abla-one-ui-check}
mobile=${ABLA_MOBILE:-$(dirname -- "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)")/../abla-mobile}
ui=${ABLA_UI:-$(dirname -- "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)")/../abla-ui}
pin=c1878461b385cd01bedbda5254211dba49bbb3b7

compile() { # in the export's root: compile <ablac arguments…>
	local command="$ablac $*"
	if [ -n "$nix" ]; then $slot $nix "$command"; else $slot $ablac "$@"; fi
}

capture() {
	local rev=$1 commit out work
	commit=$(git -C "$repo" rev-parse --verify "$rev^{commit}") || { echo "no such revision: $rev" >&2; return 2; }
	out=$store/$commit
	if [ -f "$out/DONE" ] && [ "${FORCE:-}" != 1 ]; then echo "$out"; return 0; fi
	rm -rf "$out"
	mkdir -p "$out"
	work=$(mktemp -d)
	mkdir "$work/abla-one"
	git -C "$repo" archive "$commit" | tar -x -C "$work/abla-one"
	ln -s "$(realpath "$mobile")" "$work/abla-mobile"
	[ -d "$ui" ] && ln -s "$(realpath "$ui")" "$work/abla-ui"
	mkdir -p "$work/abla-one/tools/ui-check" "$work/abla-one/build"
	cp "$here/capture.ab" "$work/abla-one/tools/ui-check/capture.ab"
	(
		cd "$work/abla-one" || exit 2
		{ "$ablac" --version; echo "abla-one $commit"; echo "abla-mobile $(git -C "$mobile" rev-parse HEAD 2>/dev/null)"; [ -d "$ui" ] && echo "abla-ui $(git -C "$ui" rev-parse HEAD 2>/dev/null)"; echo "load $(cut -d' ' -f1-3 /proc/loadavg)"; } > "$out/ABOUT"
		compile build tools/ui-check/capture.ab -o build/ui-check-capture --fast > "$out/build.log" 2>&1 || { echo "the capture program does not build at $rev:" >&2; head -20 "$out/build.log" >&2; exit 2; }
		./build/ui-check-capture "$out/screens" 30 > "$out/capture.log" 2>&1 || { echo "the capture program failed at $rev:" >&2; tail -5 "$out/capture.log" >&2; exit 2; }
		{ echo "load $(cut -d' ' -f1-3 /proc/loadavg)"; cat "$out/screens/TIMING.txt"; } > "$out/TIMING"
		rm -f "$out/screens/TIMING.txt"
		compile build examples/gallery/web.ab -o build/gallery-web --fast > "$out/gallery.log" 2>&1
		{ echo "ui-check-capture $(stat -c %s build/ui-check-capture)"; echo "gallery-web $(stat -c %s build/gallery-web 2>/dev/null || echo missing)"; } > "$out/SIZES"
		# The suite, a test at a time so one failure names itself (the Makefile's TESTS).
		: > "$out/TESTS"
		for t in tests/unit/*.ab tests/backends/*.ab tests/integration/*.ab tests/remote/client.ab tests/remote/routes.ab; do
			if compile test "$t" > "$out/test.log" 2>&1; then echo "ok   $t" >> "$out/TESTS"; else echo "FAIL $t" >> "$out/TESTS"; { echo "== $t"; tail -8 "$out/test.log"; } >> "$out/tests-failed.log"; fi
		done
		for script in tests/layout_size.sh tests/thin_config.sh; do
			if [ -n "$nix" ]; then run=($slot $nix "ABLAC=$ablac $script"); else run=(env "ABLAC=$ablac" "$script"); fi
			if "${run[@]}" > "$out/test.log" 2>&1; then echo "ok   $script" >> "$out/TESTS"; else echo "FAIL $script" >> "$out/TESTS"; { echo "== $script"; tail -8 "$out/test.log"; } >> "$out/tests-failed.log"; fi
		done
		rm -f "$out/test.log"
	) || { rm -rf "$work"; return 2; }
	rm -rf "$work"
	touch "$out/DONE"
	echo "$out"
}

case ${1:-} in
capture)
	out=$(capture "${2:?a revision}") || exit 2
	echo "captured $(ls "$out/screens" | wc -l) files, $(grep -c '^ok' "$out/TESTS") tests ok, $(grep -c '^FAIL' "$out/TESTS") failing: $out"
	cat "$out/ABOUT" "$out/SIZES" "$out/TIMING"
	;;
check)
	base=$(capture "${3:-$pin}") || exit 2
	new=$(FORCE=${FORCE:-1} capture "${2:?a revision}") || exit 2
	failed=0
	for screen in $(ls "$base/screens" | sed 's/\..*//' | sort -u); do
		first=""
		count=0
		for file in "$base/screens/$screen".*; do
			name=$(basename "$file")
			if ! cmp -s "$file" "$new/screens/$name"; then
				count=$((count + 1))
				[ -n "$first" ] || first=$name
			fi
		done
		if [ $count = 0 ]; then echo "same    $screen"; else
			failed=1
			echo "DIFFERS $screen: $count files, the first $first:"
			if [ -f "$new/screens/$first" ]; then diff <(tr '>' '>\n' < "$base/screens/$first" | sed 's/>$/>/') <(tr '>' '>\n' < "$new/screens/$first") | head -4 | cut -c1-240 | sed 's/^/          /'; else echo "          missing"; fi
		fi
	done
	extra=$(comm -13 <(ls "$base/screens") <(ls "$new/screens") | head -3 | tr '\n' ' ')
	[ -z "$extra" ] || { echo "DIFFERS files only in the new capture: $extra"; failed=1; }
	if ! diff <(sort "$base/TESTS") <(sort "$new/TESTS") > /dev/null; then
		echo "tests that changed:"; diff <(sort "$base/TESTS") <(sort "$new/TESTS") | grep '^[<>]' | sed 's/^</  was/; s/^>/  now/'
		[ "$(comm -13 <(grep '^FAIL' "$base/TESTS" | sort) <(grep '^FAIL' "$new/TESTS" | sort) | wc -l)" = 0 ] || failed=1
	else echo "tests   the same $(grep -c '^ok' "$new/TESTS") ok, $(grep -c '^FAIL' "$new/TESTS") failing"; fi
	echo "sizes (bytes)       was → now"; paste "$base/SIZES" "$new/SIZES" | awk '{ printf "  %-18s %9s → %9s (%+d)\n", $1, $2, $4, $4 - $2 }'
	echo "timing (µs, best of 30; $(head -1 "$base/TIMING") → $(head -1 "$new/TIMING"))"; paste <(tail -n +2 "$base/TIMING") <(tail -n +2 "$new/TIMING") | awk '{ printf "  %-18s %7s → %7s (%+.0f%%)\n", $1, $2, $4, ($4 - $2) * 100 / $2 }'
	[ $failed = 0 ] && echo "ui-check: identical" || echo "ui-check: NOT identical"
	exit $failed
	;;
*) sed -n '2,24p' "${BASH_SOURCE[0]}" >&2; exit 2 ;;
esac
