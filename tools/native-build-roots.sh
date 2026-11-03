#!/usr/bin/env bash
# Selected roots may be archives: source, host and native code must agree.
one_project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
one_siblings_root=$(dirname "$one_project_root")
export ABLA_COMPILER_SOURCE_ROOT=${ABLA_COMPILER_SOURCE_ROOT:-$one_siblings_root/ablac}
export ABLA_MOBILE_ROOT=${ABLA_MOBILE_ROOT:-$one_siblings_root/abla-mobile}
export ABLA_GRAPHICS_ROOT=${ABLA_GRAPHICS_ROOT:-$one_siblings_root/abla-graphics}
export ABLA_XML_ROOT=${ABLA_XML_ROOT:-$one_siblings_root/abla-xml}
ABLAC=${ABLAC:-$ABLA_COMPILER_SOURCE_ROOT/build/ablac}
one_native_tree=${ABLA_NATIVE_TREE:-$one_project_root/build/native-tree}
mkdir -p "$one_project_root/build"
"$ABLAC" build "$one_project_root/tools/check-native-build-roots.ab" -o "$one_project_root/build/check-native-build-roots" --fast
"$one_project_root/build/check-native-build-roots" "$one_project_root" --self-test
"$one_project_root/build/check-native-build-roots" mirror "$one_project_root" "$one_native_tree/abla-one"
for one_sdk in MOBILE GRAPHICS XML; do
    one_root_var="ABLA_${one_sdk}_ROOT"
    one_sdk_name="abla-$(printf '%s' "$one_sdk" | tr '[:upper:]' '[:lower:]')"
    test -d "${!one_root_var}" || { echo "Missing selected $one_root_var" >&2; return 1; }
    one_selected_root=$(cd "${!one_root_var}" && pwd)
    printf -v "$one_root_var" '%s' "$one_selected_root"
    export "$one_root_var"
    if [[ -e "$one_native_tree/$one_sdk_name" && ! -L "$one_native_tree/$one_sdk_name" ]]; then
        echo "Refusing to replace a real SDK directory in the native mirror" >&2
        return 1
    fi
    ln -sfn "$one_selected_root" "$one_native_tree/$one_sdk_name"
done
