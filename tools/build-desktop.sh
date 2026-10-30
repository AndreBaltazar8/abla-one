#!/usr/bin/env bash
# Builds an example's desktop app: tools/build-desktop.sh gallery
set -euo pipefail
cd "$(dirname "$0")/.."
example="${1:?example name}"
nix-shell shell-desktop.nix --run "../ablac/build/ablac build examples/$example/desktop/main.ab -o build/$example-desktop --fast && patchelf --set-rpath \"\$ABLA_DESKTOP_RPATH\" build/$example-desktop 2>/dev/null || nix-shell -p patchelf --run \"patchelf --set-rpath '\$ABLA_DESKTOP_RPATH' build/$example-desktop\""
echo "build/$example-desktop"
