#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
./build/readfile-live &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
for _ in $(seq 50); do curl -sf -o /dev/null http://127.0.0.1:8959/ && break; sleep 0.1; done
node tests/ui/web_live_file.mjs
