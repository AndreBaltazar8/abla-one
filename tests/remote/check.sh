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

shop="$work/p/tests/remote/server/shop.ab"
if [ "${1:-}" != "--large-only" ]; then
ABLAC="$ablac" tests/remote/lock-order.sh || exit 1
ABLAC="$ablac" tests/remote/lock-index.sh || exit 1
ABLAC="$ablac" tests/remote/lock-wide-fields.sh || exit 1
ABLAC="$ablac" tests/remote/lock-field-scale.sh || exit 1
ABLAC="$ablac" tests/remote/lock-sort-scale.sh || exit 1
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
check "fractional map value rejected" "$(post countValues '{"values":{"a":2.5}}')" 400
check "integer map value accepted" "$(post countValues '{"values":{"a":2}}')" 200
check "wrong string rejected" "$(post orders '{"status":false,"limit":3}')" 400
check "explicit null string rejected" "$(post orders '{"status":null,"limit":3}')" 400
check "explicit null integer rejected" "$(post orders '{"limit":null}')" 400
check "missing fields retain defaults" "$(post orders '{}')" 200
check "non-object arguments rejected" "$(post ping '[]')" 400
check "class array shape rejected" "$(post acceptOrder '{"order":[]}')" 400
check "class null rejected" "$(post acceptOrder '{"order":null}')" 400
check "wrong bool rejected" "$(post acceptOrder '{"order":{"paid":"false"}}')" 400
check "null bool rejected" "$(post acceptOrder '{"order":{"paid":null}}')" 400
check "array object shape rejected" "$(post acceptOrder '{"order":{"lines":{}}}')" 400
check "wrong array element rejected" "$(post acceptOrder '{"order":{"lines":[3]}}')" 400
check "nested string rejected" "$(post acceptOrder '{"order":{"lines":[{"sku":9}]}}')" 400
check "map array shape rejected" "$(post countValues '{"values":[]}')" 400
check "null map rejected" "$(post countValues '{"values":null}')" 400
check "wrong map member rejected" "$(post acceptOrder '{"order":{"tags":{"secret":7}}}')" 400
check "generic nested input rejected" "$(post acceptPage '{"page":{"items":[{"paid":1}]}}')" 400
check "generic nested input accepted" "$(post acceptPage '{"page":{"items":[{"paid":true}],"next":null}}')" 200
check "recursive wrong input rejected" "$(post acceptTree '{"value":{"label":"x","children":[{"label":2}]}}')" 400
check "recursive input accepted" "$(post acceptTree '{"value":{"label":"x","children":[{"label":"á"}]}}')" 200
check "nullable null accepted" "$(post optionalValue '{"value":null,"enabled":false}')" 200
check "nullable wrong type rejected" "$(post optionalValue '{"value":7,"enabled":false}')" 400
check "nullable real string accepted" "$(post optionalValue '{"value":"á","enabled":true}')" 200
check "floating number accepted" "$(post decimalValue '{"value":2.5}')" 200
check "floating string rejected" "$(post decimalValue '{"value":"2.5"}')" 400
check "floating null rejected" "$(post decimalValue '{"value":null}')" 400
check "legacy adapter keeps coercion" "$(post legacyJson '{"payload":false,"limit":"7"}')" 200
check "legacy adapter defaults are historical" "$(cat "$work/out")" '"0:"'
check "legacy adapter still needs an object" "$(post legacyJson 'null')" 400
check "invalid mutation refused" "$(post recordOrder '{"order":{"id":1,"paid":"false"}}')" 400
check "mutation count is readable" "$(post recordedOrderCount '{}')" 200
check "invalid input never executes application code" "$(cat "$work/out")" 0


check "retired route" "$(post oldOrders '{}')" 410
check "retired says why" "$(cat "$work/out")" '"use orders"'
check "unknown route" "$(post nope '{}')" 404
# Each request has curl's five-second deadline; a broken exponent parser cannot
# hang this regression indefinitely, and this private server is stopped next.
check "huge positive exponent refused promptly" "$(post decimalValue '{"value":1e1000000000}')" 400
check "exponent counter cannot overflow" "$(post decimalValue '{"value":1e999999999999999999999999999}')" 400
check "huge negative exponent underflows promptly" "$(post decimalValue '{"value":1e-1000000000}')" 200
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
fi

# More than a MiB of codecs and calls, with dispatcher parts and aliases.
# The compile-time probe checks the actual generated size, not a route-count guess.
copy
fields=""; values=""
for field in $(seq 1 48); do
  fields="$fields, val reviewed_fixture_field_$field: string"
  values="$values, first"
done
for n in $(seq 1 400); do
  printf '\nclass Large%d(val first: string, val nested: array<Line>, val optional: string?, val counts: Map<string,int>%s)\n@server\nfun large%d(first: string): Large%d = Large%d(first, [Line("a", 2)], null, Map<string,int>()%s)\n' "$n" "$fields" "$n" "$n" "$n" "$values" >> "$shop"
done
cp tests/remote/large/probe.ab "$work/p/tests/remote/app/large_probe.ab"
cp tests/remote/large/client.ab "$work/p/tests/remote/app/large_client.ab"
cp tests/remote/large/server.ab "$work/p/tests/remote/app/large_server.ab"
build large_client.ab large_client > "$work/log" || { cat "$work/log"; exit 1; }
check "large client calls and decodes" "$("$work/large_client")" '1 a 2'
check "large client contains no server bodies" "$(grep -c SERVER_ONLY_MARKER "$work/large_client")" 0
build large_server.ab large_server > "$work/log" || { cat "$work/log"; exit 1; }
check "split dispatcher first/middle/last and unknown" "$("$work/large_server")" '200 200 200 404 400'

# Generation limits fail even when no runtime remote call is referenced.
for kind in declaration parts; do
  copy
  cp "tests/remote/large/reject-$kind.ab" "$work/p/tests/remote/app/reject.ab"
  build reject.ab reject > "$work/log"; check "oversized $kind is a hard compile failure" "$?" 1
  check "oversized $kind names remote generation" "$(grep -c 'ONE_ERROR__remote_' "$work/log" | head -1)" 1
done
exit $failed
