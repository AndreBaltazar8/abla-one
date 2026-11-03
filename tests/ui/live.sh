#!/usr/bin/env bash
# Starts the live gallery on a free port and runs the live
# document and web-canvas browser tests against it.
set -euo pipefail
cd "$(dirname "$0")/../.."
portfile=$(mktemp)
export ONE_TEST_PORT_FILE="$portfile"
./build/gallery-live &
server=$!
server_exe=$(realpath build/gallery-live)
stop_server() {
  if [ "$(readlink "/proc/$server/exe" 2>/dev/null || true)" = "$server_exe" ]; then
    kill -TERM "$server"
    wait "$server" 2>/dev/null || true
  fi
}
cleanup() { stop_server; rm -f "$portfile"; }
trap cleanup EXIT
for _ in $(seq 100); do [ -s "$portfile" ] && break; kill -0 "$server" 2>/dev/null || exit 1; sleep 0.1; done
export ONE_TEST_PORT=$(cat "$portfile")
export ONE_TEST_BASE="http://127.0.0.1:$ONE_TEST_PORT"
for _ in $(seq 100); do curl -sf -o /dev/null "$ONE_TEST_BASE/" && break; sleep 0.1; done
node tests/ui/web_live_gallery.mjs
node tests/ui/web_live_routes.mjs
node tests/ui/web_live_events.mjs
node tests/ui/web_canvas_gallery.mjs
# Last: it restarts the server.
stop_server
node tests/ui/web_live_restart.mjs
