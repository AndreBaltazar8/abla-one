#!/usr/bin/env bash
# Builds an example's debug APK: tools/build-android.sh gallery
# Abla One needs the current compiler (generics, runtime written in Abla).
# Android libraries are entered through an export and never run `main`, so
# they need ablac's fix that roots globals for export-entered programs (in the
# sibling checkout's build/ablac until a release includes it). Without it the
# first garbage collection frees globals such as the JSON parser's limits.
set -euo pipefail
cd "$(dirname "$0")/.."
example="${1:?example name}"
P="$(cd .. && pwd)"
ABLAC="${ABLAC:-$P/ablac/build/ablac}"
RUNTIME="$PWD/build/abla-runtime-v0.2.22"
if [ ! -f "$RUNTIME/runtime/abla_runtime.c" ]; then
    mkdir -p "$RUNTIME"
    git -C "$P/ablac" archive 3da080eed592269c17297e0896a1f2a33a888d7f runtime stdlib | tar -x -C "$RUNTIME"
fi
(cd "examples/$example" && "$ABLAC" build android_build.ab -o "../../build/$example-android-driver" --fast --no-cache)
NIXPKGS_ALLOW_UNFREE=1 nix-shell "$P/coder-auto/build/android-shell.nix" --run "android-gradle -p '$PWD/examples/$example/android' :android-app:assembleDebug -PablaMobileConfiguration=debug -PablaCompilerRoot='$RUNTIME' --console=plain"
echo "examples/$example/android/android-app/build/outputs/apk/debug/android-app-debug.apk"
