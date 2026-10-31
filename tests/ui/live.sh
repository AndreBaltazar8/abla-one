#!/usr/bin/env bash
# Starts the live gallery (examples/gallery/live.ab) on :8950 and runs the live
# document and web-canvas browser tests against it.
set -euo pipefail
cd "$(dirname "$0")/../.."
./build/gallery-live &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
for _ in $(seq 50); do curl -sf -o /dev/null http://127.0.0.1:8950/ && break; sleep 0.1; done
node tests/ui/web_live_gallery.mjs
node tests/ui/web_live_routes.mjs
node tests/ui/web_live_events.mjs
node tests/ui/web_canvas_gallery.mjs
# Last: it restarts the server.
kill $server
wait $server 2>/dev/null || true
node tests/ui/web_live_restart.mjs
