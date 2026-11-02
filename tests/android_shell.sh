#!/usr/bin/env bash
# The Android build's shell is this repository's: a sibling's copy changes under it with no commit to pin.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
grep -q '"$PWD/shell-android.nix"' tools/build-android.sh || { echo "FAIL tools/build-android.sh doesn't use shell-android.nix"; exit 1; }
if git grep -q 'coder-auto' -- tools Makefile; then echo "FAIL the build still reads coder-auto"; exit 1; fi
git ls-files --error-unmatch shell-android.nix > /dev/null || { echo "FAIL shell-android.nix isn't tracked"; exit 1; }
grep -Eq 'sha256 = "[a-z0-9]{52}"' shell-android.nix || { echo "FAIL shell-android.nix doesn't pin nixpkgs"; exit 1; }
echo "ok   the Android shell is pinned here"
