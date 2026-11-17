#!/usr/bin/env bash
# The live server's framing over real sockets (tests/backends/live_framing.ab checks the rules, this the server).
# Replaces live_framing_socket.py.
#
# usage: live_framing_socket.sh SERVER_BINARY   (run from the abla-one root; the server is examples/gallery/live.ab built,
#                                               make gallery-live: build/gallery-live)
# Valid requests, with and without a body and with a second request behind a body, are answered with anything but 400;
# requests with malformed framing get 400 and the connection is closed without reading more of it.
set -u
binary=${1:?usage: live_framing_socket.sh SERVER_BINARY}
trap '' PIPE
port_file=$(mktemp -u /tmp/abla-one-framing-port.XXXXXX)
port=${ONE_TEST_FRAMING_PORT:-18120}
ONE_TEST_PORT=$port ONE_TEST_PORT_FILE=$port_file "$binary" >/dev/null 2>&1 &
server=$!
exe=$(realpath "$binary")
cleanup() {
  if [ "$(readlink "/proc/$server/exe" 2>/dev/null || true)" = "$exe" ]; then
    kill -TERM "$server" 2>/dev/null
    wait "$server" 2>/dev/null
  fi
  rm -f "$port_file"
}
trap cleanup EXIT
for _ in $(seq 100); do
  [ -e "$port_file" ] && break
  [ -e "/proc/$server/exe" ] || { echo "server failed to start" >&2; exit 1; }
  sleep 0.1
done

# exchange RAW [LATER]: send RAW (printf escapes), after 50 ms LATER; sets `statuses` (the status codes of
# the responses, space separated) and `closed` (the server closed the connection within two seconds).
exchange() {
  local data rc
  exec 3<>"/dev/tcp/127.0.0.1/$port" || { statuses=connect-failed; closed=no; return; }
  printf "$1" >&3 2>/dev/null
  if [ $# -gt 1 ]; then sleep 0.05; printf "$2" >&3 2>/dev/null; fi
  data=$(timeout 2 cat <&3 2>/dev/null | tr -d '\0'; exit "${PIPESTATUS[0]}")
  rc=$?
  exec 3<&- 3>&-
  statuses=$(printf '%s' "$data" | grep -a -o 'HTTP/1.1 [0-9][0-9][0-9]' | cut -c10- | tr '\n' ' ' | sed 's/ $//')
  if [ "$rc" = 124 ]; then closed=no; else closed=yes; fi
}

head='POST /icons/A HTTP/1.1\r\nHost: x\r\n'
get='GET /icons/A HTTP/1.1\r\nHost: x\r\n\r\n'
failed=0
total=0
report() {  # report NAME GOOD
  total=$((total + 1))
  if [ "$2" = 1 ]; then echo "ok   $1 [$statuses] $([ "$closed" = yes ] && echo closed || echo open)"
  else failed=$((failed + 1)); echo "FAIL $1 [$statuses] $([ "$closed" = yes ] && echo closed || echo open)"; fi
}

# A bad head, then a good request in a later segment on the same connection: only the 400 is answered.
exchange "${head}Content-Length: -3\r\n\r\n" "$get"
[ "$statuses" = 400 ] && report "a good request after the bad head" 1 || report "a good request after the bad head" 0

ok() {   # ok NAME RAW: answered with anything but 400
  exchange "$2"
  case "$statuses" in ""|400*) report "$1" 0 ;; *) report "$1" 1 ;; esac
}
bad() {  # bad NAME RAW: exactly one 400, and closed
  exchange "$2"
  [ "$statuses" = 400 ] && [ "$closed" = yes ] && report "$1" 1 || report "$1" 0
}

ok  "valid body" "${head}Content-Length: 3\r\n\r\nabc"
ok  "valid no body" "$get"
ok  "valid spaces" "${head}Content-Length:  3 \r\n\r\nabc"
ok  "valid agreeing" "${head}Content-Length: 3\r\nContent-Length: 3\r\n\r\nabc"
ok  "body then a second request" "${head}Content-Length: 3\r\n\r\nabc$get"
bad "negative" "${head}Content-Length: -3\r\n\r\nabc"
bad "trailing junk" "${head}Content-Length: 3x\r\n\r\nabc"
bad "signed" "${head}Content-Length: +3\r\n\r\nabc"
bad "empty" "${head}Content-Length:\r\n\r\nabc"
bad "two that differ" "${head}Content-Length: 3\r\nContent-Length: 5\r\n\r\nabc"
bad "chunked" "${head}Transfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n0\r\n\r\n"
bad "chunked with a length" "${head}Transfer-Encoding: chunked\r\nContent-Length: 3\r\n\r\nabc"
bad "an unknown coding" "${head}Transfer-Encoding: x\r\n\r\nabc"
bad "space before the colon" "${head}Content-Length : 3\r\n\r\nabc"
bad "a folded line" "${head}X-A: 1\r\n Content-Length: 3\r\n\r\nabc"
bad "space before the colon of another header" "${head}X-A : 1\r\nContent-Length: 3\r\n\r\nabc"
bad "a bare LF line end" 'POST /icons/A HTTP/1.1\nHost: x\r\nContent-Length: 3\r\n\r\nabc'
bad "a bare CR in a value" "${head}X-A: a\rb\r\nContent-Length: 3\r\n\r\nabc"
bad "a Content-Length after a bare LF in a value" "${head}X-A: a\nContent-Length: 3\r\n\r\nabc"
bad "a Transfer-Encoding after a bare CR in a value" "${head}X-A: a\rTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n0\r\n\r\n"

echo "$((total - failed)) of $total cases as expected"
[ "$failed" = 0 ]
