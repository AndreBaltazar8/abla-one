#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
portfile=$(mktemp)
export ONE_TEST_PORT_FILE="$portfile"
./build/readfile-live &
server=$!
trap 'kill "$server" 2>/dev/null || true; rm -f "$portfile"' EXIT
for _ in $(seq 100); do [ -s "$portfile" ] && break; kill -0 "$server" 2>/dev/null || exit 1; sleep 0.1; done
export ONE_TEST_BASE="http://127.0.0.1:$(cat "$portfile")"
for _ in $(seq 100); do curl -sf -o /dev/null "$ONE_TEST_BASE/" && break; sleep 0.1; done
node tests/ui/web_live_file.mjs
