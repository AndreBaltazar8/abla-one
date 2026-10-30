"""PaperMono device simulator for the epaper host (examples/gallery/epaper.ab).

Plays the firmware's part: polls /one/epaper/update, copies each rectangle
of the wire format into its own 96000-byte SSD1677 canvas (two planes, as
abla-embedded's ssd1677_canvas.ab lays them out) and taps through
/one/epaper/touch. After every step the simulated canvas must equal the
host's canvas byte for byte. Writes build/ui/epaper-device.png (what the
simulated panel shows). Run from the abla-one root."""
import os, struct, subprocess, sys, time, urllib.request, zlib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BASE = 'http://127.0.0.1:8954'
WIDTH, HEIGHT = 800, 480            # physical
STRIDE = WIDTH // 8
PLANE = STRIDE * HEIGHT
failures = 0

def check(ok, label, detail=''):
    global failures
    print(('ok   ' if ok else 'FAIL ') + label + ('' if ok else f' {detail}'))
    if not ok: failures += 1

def get(path, method='GET'):
    request = urllib.request.Request(BASE + path, method=method, data=b'' if method == 'POST' else None)
    with urllib.request.urlopen(request) as response:
        return response.status, response.read()

def apply(canvas, wire):
    """Copies an update's rectangles into the canvas; returns (revision, mode, rects)."""
    assert wire[:4] == b'ONE1', wire[:8]
    revision, mode, count = struct.unpack_from('<IBB', wire, 4)
    offset = 10
    rects = []
    for _ in range(count):
        x, y, w, h = struct.unpack_from('<HHHH', wire, offset)
        offset += 8
        rects.append((x, y, w, h))
        for base in (0, PLANE):
            for row in range(y, y + h):
                start = base + row * STRIDE + x // 8
                canvas[start:start + w // 8] = wire[offset:offset + w // 8]
                offset += w // 8
    assert offset == len(wire), (offset, len(wire))
    return revision, mode, rects

def level(canvas, x, y):
    """Portrait pixel (480×800) → grey level, through rotation 3."""
    px, py = y, 479 - x
    bit = 128 >> (px & 7)
    i = py * STRIDE + (px >> 3)
    return (1 if canvas[i] & bit else 0) | (2 if canvas[i + PLANE] & bit else 0)

def png(canvas, path):
    rows = b''.join(b'\0' + bytes(level(canvas, x, y) * 85 for x in range(480)) for y in range(800))
    chunk = lambda kind, data: struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 480, 800, 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))

def main():
    server = subprocess.Popen([os.path.join(ROOT, 'build/gallery-epaper')], cwd=ROOT)
    try:
        for _ in range(50):
            try:
                get('/one/epaper/update?have=0')
                break
            except Exception:
                time.sleep(0.1)
        canvas = bytearray(2 * PLANE)
        status, wire = get('/one/epaper/update?have=-1')
        revision, mode, rects = apply(canvas, wire)
        check(status == 200 and mode == 2 and rects == [(0, 0, 800, 480)], 'a new device gets the whole panel with a quality refresh', (mode, rects))
        check(canvas == get('/one/epaper/canvas')[1], 'the simulated canvas equals the host canvas')
        status, _ = get(f'/one/epaper/update?have={revision}')
        check(status == 204, 'nothing new: 204')

        # Find the dark primary button: the first wide run of black rows.
        button = next(y for y in range(60, 700) if sum(1 for x in range(20, 460) if level(canvas, x, y) == 0) > 380)
        status, wire = get(f'/one/epaper/touch?x=240&y={button + 20}&have={revision}', 'POST')
        before = bytes(canvas)
        revision, mode, rects = apply(canvas, wire)
        area = sum(w * h for _, _, w, h in rects)
        check(status == 200 and mode == 4, 'a tap answers with a fast partial update', mode)
        check(0 < area < WIDTH * HEIGHT // 10, f'covering a small area ({area} px in {len(rects)} rectangles)')
        check(all(x % 8 == 0 and w % 8 == 0 for x, _, w, _ in rects), 'rectangles are byte aligned')
        check(canvas != before and canvas == get('/one/epaper/canvas')[1], 'after applying it, the canvas equals the host canvas')

        # A device that missed an update gets the whole panel again.
        stale = revision
        get(f'/one/epaper/touch?x=240&y={button + 20}&have={stale}', 'POST')
        status, wire = get(f'/one/epaper/touch?x=240&y={button + 20}&have={stale}', 'POST')
        revision, mode, rects = apply(canvas, wire)
        check(mode == 2 and rects == [(0, 0, 800, 480)], 'a device that fell behind gets a full update', (mode, rects))
        check(canvas == get('/one/epaper/canvas')[1], 'and matches the host again')

        # Tap the "Pessoas" tab at the bottom right: a larger change.
        status, wire = get(f'/one/epaper/touch?x=350&y=775&have={revision}', 'POST')
        revision, mode, rects = apply(canvas, wire)
        check(status == 200 and canvas == get('/one/epaper/canvas')[1], f'switching tabs (mode {mode}, {len(rects)} rectangles) keeps the canvas in step')
        dark = sum(1 for y in range(0, 800, 4) for x in range(0, 480, 4) if level(canvas, x, y) < 3)
        check(dark > 500, 'the people list is drawn', dark)
        os.makedirs(os.path.join(ROOT, 'build/ui'), exist_ok=True)
        png(canvas, os.path.join(ROOT, 'build/ui/epaper-device.png'))
    finally:
        server.terminate()
    print('PASS tests/ui/epaper_device.py' if failures == 0 else f'{failures} failed')
    sys.exit(1 if failures else 0)

main()
