#!/usr/bin/env bash
# @server end to end: a real server over HTTP, the server.lock rules, a value that
# can't cross the network, and what reaches a client binary.
set -u
cd "$(dirname "$0")/../.."
ablac=$(realpath -s "${ABLAC:-../ablac/build/ablac}")
work=$(mktemp -d)
pid=0; failed=0
trap 'rm -rf "$work"; [ "$pid" != 0 ] && kill "$pid" 2>/dev/null' EXIT
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: got '$2', expected '$3'"; failed=1; fi; }

copy() { rm -rf "$work/p"; mkdir -p "$work/p/tests"; cp -r src "$work/p/"; cp -r tests/remote "$work/p/tests/"; }
build() { (cd "$work/p/tests/remote/app" && "$ablac" build "$1" -o "$work/$2" --fast 2>&1); }

copy
build server.ab server > "$work/log" || { cat "$work/log"; exit 1; }
lock="$work/p/tests/remote/app/server.lock"
check "lock is written" "$(grep -c '^route orders' "$lock")" 1
"$work/server" & pid=$!
sleep 1
post() { curl -s -m 5 -o "$work/out" -w '%{http_code}' -X POST -d "$2" "http://127.0.0.1:8977/one/$1"; }
check "route answers" "$(post orders '{"status":"open","limit":3}')" 200
check "nested result" "$(grep -c '"sku":"a"' "$work/out")" 1
check "retired route" "$(post oldOrders '{}')" 410
check "retired says why" "$(cat "$work/out")" '"use orders"'
check "unknown route" "$(post nope '{}')" 404
kill $pid; wait $pid 2>/dev/null; pid=0

# Client binary: no server bodies.
build client.ab client > "$work/log" || { cat "$work/log"; exit 1; }
check "client runs" "$("$work/client")" 1
check "no server code in the client" "$(grep -c SERVER_ONLY_MARKER "$work/client")" 0

# The lock: adding passes, changing and removing fail, @retired is the way out.
shop="$work/p/tests/remote/server/shop.ab"
printf '\n@server\nfun added(): int = 1\n' >> "$shop"
build server.ab server > "$work/log"; check "adding a route passes" "$?" 0
check "and is recorded" "$(grep -c '^route added' "$lock")" 1
cp "$shop" "$work/shop"
sed -i 's/fun ping(): string = "pong"/fun ping(): int = 1/' "$shop"
build server.ab server > "$work/log"; check "changing a route fails" "$?" 1
check "naming it" "$(grep -c 'route_ping_changed' "$work/log")" 1
cp "$work/shop" "$shop"
sed -i '/^@server$/{N;/fun ping/d}' "$shop"
build server.ab server > "$work/log"; check "removing a route fails" "$?" 1
check "naming it" "$(grep -c 'route_ping_was_removed' "$work/log")" 1
cp "$work/shop" "$shop"
sed -i 's/val sku: string, val count: int/val sku: int, val count: int/; s/Line("a", 2)/Line(1, 2)/' "$shop"
build server.ab server > "$work/log"; check "changing a field fails" "$?" 1
cp "$work/shop" "$shop"
sed -i 's/^fun ping(): string/@retired("gone")\nfun ping(): string/' "$shop"
build server.ab server > "$work/log"; check "retiring a route passes" "$?" 0
cp "$work/shop" "$shop"
sed -i 's/val sku: string, val count: int/val sku: string, val count: int, val extra: string?/; s/Line("a", 2)/Line("a", 2, null)/' "$shop"
build server.ab server > "$work/log"; check "adding a field passes" "$?" 0
cp "$work/shop" "$shop"

# A closure in a data shape names the field.
copy
printf '\nclass Bad(val run: () -> int)\n@server\nfun bad(): Bad = Bad({ 1 })\n' >> "$shop"
build server.ab server > "$work/log"; check "a closure fails" "$?" 1
check "naming the field" "$(grep -c 'bad__result_run' "$work/log")" 1
exit $failed
