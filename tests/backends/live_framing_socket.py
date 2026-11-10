#!/usr/bin/env python3
"""The live server's framing over real sockets (tests/backends/live_framing.ab checks the rules, this the server).

usage: live_framing_socket.py SERVER_BINARY   (run from the abla-one root; the server is examples/gallery/live.ab built)
Valid requests, with and without a body and with a second request behind a body, are answered with anything but 400;
requests with malformed framing get 400 and the connection is closed without reading more of it."""
import os, socket, subprocess, sys, time

binary = sys.argv[1]
port_file = "/tmp/abla-one-framing-port"
if os.path.exists(port_file): os.remove(port_file)
port = 18120
server = subprocess.Popen([binary], env=dict(os.environ, ONE_TEST_PORT=str(port), ONE_TEST_PORT_FILE=port_file),
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    if os.path.exists(port_file): break
    time.sleep(0.1)

def exchange(raw: bytes):
    """The responses' status codes and whether the server closed the connection."""
    s = socket.create_connection(("127.0.0.1", port), timeout=2)
    s.sendall(raw)
    data = b""
    closed = False
    deadline = time.time() + 2
    while time.time() < deadline:
        try:
            chunk = s.recv(65536)
        except socket.timeout:
            break
        if not chunk:
            closed = True
            break
        data += chunk
    s.close()
    statuses = [int(part[9:12]) for part in data.split(b"HTTP/1.1 ")[1:] and [b"HTTP/1.1 " + p for p in data.split(b"HTTP/1.1 ")[1:]]]
    return statuses, closed

head = b"POST /icons/A HTTP/1.1\r\nHost: x\r\n"
cases = [
    ("valid body", head + b"Content-Length: 3\r\n\r\nabc", "ok"),
    ("valid no body", b"GET /icons/A HTTP/1.1\r\nHost: x\r\n\r\n", "ok"),
    ("valid spaces", head + b"Content-Length:  3 \r\n\r\nabc", "ok"),
    ("valid agreeing", head + b"Content-Length: 3\r\nContent-Length: 3\r\n\r\nabc", "ok"),
    ("body then a second request", head + b"Content-Length: 3\r\n\r\nabcGET /icons/A HTTP/1.1\r\nHost: x\r\n\r\n", "ok"),
    ("negative", head + b"Content-Length: -3\r\n\r\nabc", "bad"),
    ("trailing junk", head + b"Content-Length: 3x\r\n\r\nabc", "bad"),
    ("signed", head + b"Content-Length: +3\r\n\r\nabc", "bad"),
    ("empty", head + b"Content-Length:\r\n\r\nabc", "bad"),
    ("two that differ", head + b"Content-Length: 3\r\nContent-Length: 5\r\n\r\nabc", "bad"),
    ("chunked", head + b"Transfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n0\r\n\r\n", "bad"),
    ("chunked with a length", head + b"Transfer-Encoding: chunked\r\nContent-Length: 3\r\n\r\nabc", "bad"),
    ("an unknown coding", head + b"Transfer-Encoding: x\r\n\r\nabc", "bad"),
    ("space before the colon", head + b"Content-Length : 3\r\n\r\nabc", "bad"),
    ("a folded line", head + b"X-A: 1\r\n Content-Length: 3\r\n\r\nabc", "bad"),
    ("space before the colon of another header", head + b"X-A : 1\r\nContent-Length: 3\r\n\r\nabc", "bad"),
    ("a bare LF line end", b"POST /icons/A HTTP/1.1\nHost: x\r\nContent-Length: 3\r\n\r\nabc", "bad"),
    ("a bare CR in a value", head + b"X-A: a\rb\r\nContent-Length: 3\r\n\r\nabc", "bad"),
    ("a Content-Length after a bare LF in a value", head + b"X-A: a\nContent-Length: 3\r\n\r\nabc", "bad"),
    ("a Transfer-Encoding after a bare CR in a value", head + b"X-A: a\rTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n0\r\n\r\n", "bad"),
]
def late_request():
    """A bad head, then a good request in a later segment on the same connection: only the 400 is answered."""
    s = socket.create_connection(("127.0.0.1", port), timeout=2)
    s.sendall(head + b"Content-Length: -3\r\n\r\n")
    time.sleep(0.05)
    try:
        s.sendall(b"GET /icons/A HTTP/1.1\r\nHost: x\r\n\r\n")
    except OSError:
        pass
    data = b""
    deadline = time.time() + 2
    while time.time() < deadline:
        try:
            chunk = s.recv(65536)
        except socket.timeout:
            break
        if not chunk:
            break
        data += chunk
    s.close()
    return [int(p[9:12]) for p in [b"HTTP/1.1 " + q for q in data.split(b"HTTP/1.1 ")[1:]]]

failed = 0
late = late_request()
good = late == [400]
failed += 0 if good else 1
print(("ok   " if good else "FAIL ") + "a good request after the bad head", late)
cases_total = 1
for name, raw, expect in cases:
    statuses, closed = exchange(raw)
    if expect == "ok":
        good = len(statuses) >= 1 and statuses[0] != 400
    else:
        good = statuses == [400] and closed
    failed += 0 if good else 1
    print(("ok   " if good else "FAIL ") + name, statuses, "closed" if closed else "open")
server.terminate(); server.wait(timeout=10)
print("%d of %d cases as expected" % (len(cases) + 1 - failed, len(cases) + 1))
sys.exit(1 if failed else 0)
