#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
portfile=$(mktemp)
export ONE_TEST_PORT_FILE="$portfile"
./build/viewport-live &
viewport_pid=$!
viewport_exe=$(realpath build/viewport-live)
cleanup() {
  if [ "$(readlink "/proc/$viewport_pid/exe" 2>/dev/null || true)" = "$viewport_exe" ]; then
    kill -TERM "$viewport_pid"
    wait "$viewport_pid" 2>/dev/null || true
  fi
  rm -f "$portfile"
}
trap cleanup EXIT
for _ in $(seq 100); do
  [ -s "$portfile" ] && break
  [ -e "/proc/$viewport_pid/exe" ] || exit 1
  sleep 0.1
done
export ONE_TEST_BASE="http://127.0.0.1:$(cat "$portfile")"
timeout 90 node tests/ui/web_live_viewport.mjs
