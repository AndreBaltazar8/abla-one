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

copy() { rm -rf "$work/p"; mkdir -p "$work/p/tests"; cp -r src "$work/p/"; cp -r tests/remote "$work/p/tests/"; cp tests/port.ab "$work/p/tests/"; }
build() { (cd "$work/p/tests/remote/app" && "$ablac" build "$1" -o "$work/$2" --fast 2>&1); }

copy
build server.ab server > "$work/log" || { cat "$work/log"; exit 1; }
lock="$work/p/tests/remote/app/server.lock"
check "lock is written" "$(grep -c '^route orders' "$lock")" 1
check "lock holds no checkout paths" "$(grep -c __abla_module "$lock")" 0
ONE_TEST_PORT_FILE="$work/port" "$work/server" & pid=$!
for _ in $(seq 100); do [ -s "$work/port" ] && break; kill -0 "$pid" 2>/dev/null || exit 1; sleep 0.1; done
port=$(cat "$work/port")
post() { curl -s -m 5 -o "$work/out" -w '%{http_code}' -X POST -d "$2" "http://127.0.0.1:$port/one/$1"; }
check "route answers" "$(post orders '{"status":"open","limit":3}')" 200
check "nested result" "$(grep -c '"sku":"a"' "$work/out")" 1
check "fractional integer rejected" "$(post orders '{"status":"open","limit":23.5}')" 400
check "validation error names the argument" "$(cat "$work/out")" '"invalid integer in limit"'
check "string integer rejected" "$(post orders '{"status":"open","limit":"23"}')" 400
check "overflow integer rejected" "$(post orders '{"status":"open","limit":9223372036854775808}')" 400
check "nested fractional integer rejected" "$(post acceptOrder '{"order":{"id":1,"lines":[{"sku":"a","count":2.5}]}}')" 400
check "nested integers accepted" "$(post acceptOrder '{"order":{"id":1,"lines":[{"sku":"a","count":2}]}}')" 200
check "retired route" "$(post oldOrders '{}')" 410
check "retired says why" "$(cat "$work/out")" '"use orders"'
check "unknown route" "$(post nope '{}')" 404
kill $pid; wait $pid 2>/dev/null; pid=0

# Client binary: no server bodies.
build client.ab client > "$work/log" || { cat "$work/log"; exit 1; }
check "client runs" "$("$work/client")" 1
check "no server code in the client" "$(grep -c SERVER_ONLY_MARKER "$work/client")" 0
build client_slim.ab client_slim > "$work/log" || { cat "$work/log"; exit 1; }
check "\$remoteCall, oneRemoteReply and \$remoteDecode" "$("$work/client_slim" | tr '\n' '|')" "1|retired use orders|ok 7 a 2|"

# A server that runs its client code too, from the same source as a client build.
build both.ab both > "$work/log" || { cat "$work/log"; exit 1; }
check "client code through the route" "$("$work/both" | tr '\n' ' ')" "a a SERVER_ONLY_MARKER "
build both_client_main.ab both_client > "$work/log" || { cat "$work/log"; exit 1; }
check "same client source runs alone" "$("$work/both_client")" 1
check "and holds no server code" "$(grep -c SERVER_ONLY_MARKER "$work/both_client")" 0
build both_unconsumed.ab both_unconsumed > "$work/log"; check "a contract call without \$remote fails" "$?" 1
check "naming the error" "$(grep -c E_CONTRACT_CALL_NOT_CONSUMED "$work/log")" 1

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

# A route named like one of the live server's own paths would never be reached.
for name in live upload cookies host canvas fonts thin; do
  copy
  printf '\n@server\nfun %s(): int = 1\n' "$name" >> "$shop"
  build server.ab server > "$work/log"; check "a route named $name fails" "$?" 1
  check "and says so" "$(grep -c "route_${name}_is_reserved" "$work/log")" 1
done
copy
printf '\n@server\nfun livestock(): int = 1\n' >> "$shop"
build server.ab server > "$work/log"; check "a name that only starts like one is fine" "$?" 0

# Many routes and shapes, through an alias: each class is spelled once, and all of them right.
copy
for n in $(seq 1 60); do
  printf '\nclass Many%d(val first: string, val third: array<Line>)\n@server\nfun many%d(first: string): Many%d = Many%d(first, [Line("a", 2)])\n' "$n" "$n" "$n" "$n" >> "$shop"
done
build server.ab server > "$work/log"; check "many routes build" "$?" 0
rm -f "$work/port"
ONE_TEST_PORT_FILE="$work/port" "$work/server" & pid=$!
for _ in $(seq 100); do [ -s "$work/port" ] && break; kill -0 "$pid" 2>/dev/null || exit 1; sleep 0.1; done
port=$(cat "$work/port")
check "the last answers" "$(post many60 '{"first":"x"}')" 200
check "with its shape" "$(grep -c '"sku":"a"' "$work/out")" 1
kill $pid; wait $pid 2>/dev/null; pid=0
build both.ab both > "$work/log"; check "and a client beside the server" "$?" 0
exit $failed
