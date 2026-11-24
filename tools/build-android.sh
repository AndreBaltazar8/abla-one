#!/usr/bin/env bash
# Builds an example's debug APK: tools/build-android.sh gallery
set -euo pipefail
cd "$(dirname "$0")/.."
example="${1:?example name}"
source tools/native-build-roots.sh android
RUNTIME="${ABLA_COMPILER_ROOT:-$ABLA_COMPILER_SOURCE_ROOT}"
export ABLA_COMPILER_ROOT="$RUNTIME"
sdk_link="examples/$example/build/mobile-sdk"
mkdir -p "$(dirname "$sdk_link")"
if [[ -e "$sdk_link" && ! -L "$sdk_link" ]]; then
    echo "Refusing to replace the SDK directory at $sdk_link" >&2
    exit 1
fi
ln -sfn "$ABLA_MOBILE_ROOT" "$sdk_link"
"$ABLAC" build "examples/$example/android_build.ab" -o "build/$example-android-driver" --fast --no-cache
NIXPKGS_ALLOW_UNFREE=1 nix-shell "$PWD/shell-android.nix" --run "android-gradle -p '$PWD/examples/$example/android' :android-app:assembleDebug -PablaMobileConfiguration=debug -PablaCompilerRoot='$RUNTIME' --console=plain"
echo "examples/$example/android/android-app/build/outputs/apk/debug/android-app-debug.apk"
