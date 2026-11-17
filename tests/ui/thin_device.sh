#!/usr/bin/env bash
# Starts build/gallery-thin (make gallery-thin) and plays a thin device against it with build/thin-device.
set -euo pipefail
cd "$(dirname "$0")/../.."
portfile=$(mktemp)
export ONE_TEST_PORT_FILE="$portfile"
./build/gallery-thin &
pid=$!
exe=$(realpath build/gallery-thin)
cleanup() {
  if [ "$(readlink "/proc/$pid/exe" 2>/dev/null || true)" = "$exe" ]; then
    kill -TERM "$pid"
    wait "$pid" 2>/dev/null || true
  fi
  rm -f "$portfile"
}
trap cleanup EXIT
for _ in $(seq 100); do
  [ -s "$portfile" ] && break
  [ -e "/proc/$pid/exe" ] || { echo "thin server failed to start" >&2; exit 1; }
  sleep 0.1
done
timeout 60 ./build/thin-device "$(cat "$portfile")"
