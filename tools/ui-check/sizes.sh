#!/usr/bin/env bash
# What a revision of abla-one adds to NovaKind's optimized server: app.ab built by pinned-build
# without --fast at <base> and at <rev>, file sizes and `size` sections side by side, and the
# symbols that grew most (nm --size-sort), from a NovaKind worktree with `make tool` done.
#   tools/ui-check/sizes.sh <novakind worktree> <rev> [<base>, default NovaKind's pin file]
set -uo pipefail
{
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo=$(dirname -- "$(git -C "$here" rev-parse --path-format=absolute --git-common-dir)")
nk=$(cd -- "${1:?a NovaKind worktree}" && pwd); rev=${2:?a revision}
base=${3:-$(cat "$nk/toolchain/abla-one-revision")}
case $nk in */.claude/worktrees/*) ;; *) echo "not a worktree under .claude/worktrees" >&2; exit 2 ;; esac
cd "$nk" || exit 2
for side in was now; do
	commit=$(git -C "$repo" rev-parse --verify "$([ $side = now ] && echo "$rev" || echo "$base")^{commit}") || exit 2
	if [ ! -f "build/ui-check-app-opt.$commit" ] || [ "${FORCE:-}" = 1 ]; then
		ABLA_ONE_REV=$commit ABLA_ONE_REPO=$repo tools/compiler-slot nix-shell toolchain/shell.nix --run "build/novakind-tool pinned-build app.ab -o build/ui-check-app-opt.$commit --no-cache" > "build/ui-check-app-opt.$commit.log" 2>&1 || { echo "app.ab does not build optimized at $side: $(grep -m 2 -A 2 '^error' "build/ui-check-app-opt.$commit.log")" >&2; exit 2; }
	fi
	eval "$side=build/ui-check-app-opt.$commit"
done
echo "abla-ui: $(grep '^abla-ui ' toolchain/sibling-revisions || echo 'not pinned')"
echo "optimized server (bytes): was $(stat -c %s "$was"), now $(stat -c %s "$now"), $(( $(stat -c %s "$now") - $(stat -c %s "$was") )) more"
size "$was" "$now"
echo "symbols that grew or are new, by bytes (top 25):"
join -a 2 -e 0 -o 0,1.2,2.2 <(nm --size-sort -S "$was" | awk '{ s[$4] += strtonum("0x" $2) } END { for (n in s) print n, s[n] }' | sort) <(nm --size-sort -S "$now" | awk '{ s[$4] += strtonum("0x" $2) } END { for (n in s) print n, s[n] }' | sort) | awk '$3 > $2 { print $3 - $2, $1 }' | sort -rn | head -25
}
