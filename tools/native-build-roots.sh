#!/usr/bin/env bash
# Source from a native build entry point. Selected roots may be clean archives
# prepared by a consumer; source imports, Gradle and CMake must agree on them.
one_project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
one_siblings_root=$(dirname "$one_project_root")
export ABLA_COMPILER_SOURCE_ROOT=${ABLA_COMPILER_SOURCE_ROOT:-$one_siblings_root/ablac}
export ABLA_MOBILE_ROOT=${ABLA_MOBILE_ROOT:-$one_siblings_root/abla-mobile}
export ABLA_GRAPHICS_ROOT=${ABLA_GRAPHICS_ROOT:-$one_siblings_root/abla-graphics}
export ABLA_XML_ROOT=${ABLA_XML_ROOT:-$one_siblings_root/abla-xml}
ABLAC=${ABLAC:-$ABLA_COMPILER_SOURCE_ROOT/build/ablac}
one_native_tree=${ABLA_NATIVE_TREE:-$one_project_root/build/native-tree}
# Real mirror directories keep compiler-driven nested builds in this tree even
# when they resolve a relative entry against the process working directory.
python3 - "$one_project_root" "$one_native_tree/abla-one" <<'MIRROR'
from pathlib import Path
import os
import sys
source, target = map(Path, sys.argv[1:])
if source.resolve() == target.resolve():
    raise SystemExit("native tree must be separate from the source checkout")
for example in ("gallery", "services"):
    for relative in (f"examples/{example}", f"examples/{example}/android/android-app"):
        source.joinpath(relative, "build").mkdir(parents=True, exist_ok=True)
for entry in ("src", "examples", "tests"):
    for directory, dirs, files in os.walk(source / entry):
        relative = Path(directory).relative_to(source)
        destination = target / relative
        if destination.is_symlink(): destination.unlink()
        destination.mkdir(parents=True, exist_ok=True)
        for name in list(dirs):
            if name in {"build", ".gradle", ".cxx", ".kotlin"}:
                dirs.remove(name)
                files.append(name)
        for name in files:
            link = destination / name
            if link.is_symlink(): link.unlink()
            if link.exists(): raise SystemExit(f"Unexpected real file in native mirror: {link}")
            link.symlink_to(Path(directory) / name)
for name in ("abla.toml", "abla.lock", ".abla", "build"):
    origin, link = source / name, target / name
    if origin.exists():
        if link.is_symlink(): link.unlink()
        if not link.exists(): link.symlink_to(origin)
MIRROR
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

python3 "$one_project_root/tools/check-native-build-roots.py"
