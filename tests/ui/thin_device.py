#!/usr/bin/env python3
"""Plays a thin device against the gallery's app (make gallery-thin): gets the tree,
presses a button by its event id, sees the new tree, and sees 204 with nothing new."""
import json, subprocess, sys, time, urllib.request, urllib.error

server = subprocess.Popen(["build/gallery-thin"])
base = "http://127.0.0.1:8954/one/thin"
failures = 0

def check(name, ok):
    global failures
    print(("ok   " if ok else "FAIL ") + name)
    failures += 0 if ok else 1

def call(path, method="GET"):
    request = urllib.request.Request(base + path, method=method, data=b"" if method == "POST" else None)
    with urllib.request.urlopen(request, timeout=5) as answer:
        return answer.status, answer.read()

def find(node, wanted):
    """The press event of the first pressable whose subtree has text containing `wanted`."""
    attrs = dict(zip(node[3][0::2], node[3][1::2]))
    def has(n):
        a = dict(zip(n[3][0::2], n[3][1::2]))
        return wanted in a.get("text", "") or any(has(c) for c in n[4])
    if "onPress" in attrs and has(node):
        return int(attrs["onPress"])
    for child in node[4]:
        found = find(child, wanted)
        if found:
            return found
    return 0

try:
    for _ in range(50):
        try:
            status, body = call("/tree?have=-1")
            break
        except OSError:
            time.sleep(0.1)
    tree = json.loads(body)
    check("gets the tree", status == 200 and tree["root"][0] != "")
    check("styles are shared", len(tree["styles"]) < 400)
    status, _ = call(f"/tree?have={tree['revision']}")
    check("nothing new: 204", status == 204)
    event = find(tree["root"], "Adicionar (0)")
    check("finds the button", event > 0)
    status, body = call(f"/event?id={event}", "POST")
    after = json.loads(body)
    check("an event answers with the new tree", status == 200 and after["revision"] == tree["revision"] + 1)
    check("and the app ran", find(after["root"], "Adicionar (1)") > 0)
    # A press made on a screen the app has left: the id means something else now.
    stale = find(after["root"], "Adicionar (1)")
    shown = after["revision"]
    _, body = call(f"/event?id={find(after['root'], 'Pessoas')}&r={shown}", "POST")
    people = json.loads(body)
    check("a move answers with the new screen", find(people["root"], "Maya Townsend") > 0)
    check("the tree says its entry", "one.entry" in people["root"][3])
    _, body = call(f"/event?id={stale}&r={shown}", "POST")
    check("a press from the previous route is dropped", json.loads(body)["revision"] == people["revision"])
    _, body = call(f"/event?id={find(people['root'], 'Componentes')}&r={people['revision']}", "POST")
    check("and did nothing on the way", find(json.loads(body)["root"], "Adicionar (1)") > 0)
finally:
    server.terminate()
print("PASS tests/ui/thin_device.py" if failures == 0 else f"{failures} failed")
sys.exit(1 if failures else 0)
