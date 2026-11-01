"""Android services test: real requests from the abla-mobile host to an echo
server behind a temporary HTTPS tunnel. Covers headers and methods, JSON,
bytes, a 500 KB in-memory body, a picked file streamed as the body and as a
multipart part, a 3 MB download saved to a file and read back by range,
typed secure storage and timers."""
import json, os, re, subprocess, sys, time, xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PACKAGE = 'dev.abla.one.services'
CLOUDFLARED = subprocess.check_output('ls -d /nix/store/*cloudflared-2026.10.3/bin/cloudflared | head -1', shell=True).decode().strip()
failures = 0

def adb(*args): return subprocess.check_output(['adb', *args]).decode(errors='replace')
def nodes():
    adb('shell', 'uiautomator', 'dump', '/sdcard/one-ui.xml')
    return list(ET.fromstring(adb('shell', 'cat', '/sdcard/one-ui.xml')).iter('node'))
def find(text, tries=10, contains=False):
    for _ in range(tries):
        for n in nodes():
            t = n.get('text') or ''
            if (contains and text in t) or t == text or n.get('content-desc') == text: return n
        time.sleep(0.5)
    return None
def tap_node(n):
    b = list(map(int, re.findall(r'\d+', n.get('bounds'))))
    adb('shell', 'input', 'tap', str((b[0] + b[2]) // 2), str((b[1] + b[3]) // 2))
def tap(text):
    for _ in range(4):
        n = find(text, tries=2)
        if n is not None:
            tap_node(n)
            return
        adb('shell', 'input', 'swipe', '540', '1700', '540', '900')
    raise SystemExit(f'FAIL control not found: {text}')
def log_line(prefix, timeout=40):
    end = time.time() + timeout
    while time.time() < end:
        for n in nodes():
            for line in (n.get('text') or '').split('\n'):
                if line.startswith(prefix + ':'): return line
        time.sleep(1)
    return ''
def dismiss_system_dialog():
    # The system's "isn't responding" dialog, seen for System UI after a boot under load, takes every tap and key meant for the app.
    if 'Application Not Responding' in adb('shell', 'dumpsys', 'window'):
        print('dismissed the system\'s "isn\'t responding" dialog')
        adb('shell', 'input', 'keyevent', '4')
        time.sleep(1)
def check(ok, label, detail=''):
    global failures
    if not ok:
        failures += 1
        print('FAIL', label, detail)
    else:
        print('ok  ', label)

echo = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tests/ui/echo.py'), '9188'])
tunnel = subprocess.Popen([CLOUDFLARED, 'tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:9188'], stderr=subprocess.PIPE, text=True)
try:
    url = ''
    for line in tunnel.stderr:
        m = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
        if m:
            url = m.group(0)
            break
    open(os.path.join(ROOT, 'examples/services/echo_url.ab'), 'w').write(f'fun echoUrl(): string = "{url}"\n')
    # New tunnel hostnames take a moment to resolve; a failed lookup is cached by
    # the device, so wait until both this machine and the emulator resolve it.
    host = url.split('//')[1]
    for _ in range(60):
        if subprocess.run(['curl', '-sf', '-o', '/dev/null', url + '/echo']).returncode == 0 and \
           'unknown host' not in subprocess.run(['adb', 'shell', 'ping', '-c', '1', '-W', '2', host], capture_output=True, text=True).stdout: break
        time.sleep(2)
    subprocess.run([os.path.join(ROOT, 'tools/build-android.sh'), 'services'], check=True, stdout=subprocess.DEVNULL)
    adb('install', '-r', os.path.join(ROOT, 'examples/services/android/android-app/build/outputs/apk/debug/android-app-debug.apk'))
    # A file for the document picker: 1.5 MB in Downloads.
    subprocess.run(['dd', 'if=/dev/urandom', 'of=/tmp/abla-one-upload.bin', 'bs=1024', 'count=1536'], check=True, capture_output=True)
    adb('push', '/tmp/abla-one-upload.bin', '/sdcard/Download/abla-one-upload.bin')
    adb('shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file:///sdcard/Download/abla-one-upload.bin')
    dismiss_system_dialog()
    adb('shell', 'am', 'force-stop', PACKAGE)
    adb('shell', 'monkey', '-p', PACKAGE, '1')
    find('JSON PUT')

    tap('JSON PUT'); line = log_line('json')
    check('"m": "PUT"' in line and '"x": "one"' in line and '"type": "application/json"' in line and '\\"n\\":7' in line, 'PUT with custom header and JSON body', line)
    tap('Bytes POST'); line = log_line('bytes')
    check('"len": 5' in line and '"type": "application/octet-stream"' in line, 'byte body', line)
    tap('Large body'); line = log_line('large')
    check('"len": 500000' in line, '500 KB in-memory body', line)
    tap('Pick file')
    picker = find('abla-one-upload.bin', tries=20)
    if picker is None:
        tap('Downloads') if find('Downloads', tries=4) else None
        picker = find('abla-one-upload.bin', tries=20)
    check(picker is not None, 'document picker shows the file')
    if picker is not None: tap_node(picker)
    line = log_line('pick')
    check('abla-one-upload.bin 1572864' in line, 'picked file handle with name and size', line)
    tap('Upload file'); line = log_line('upload', 90)
    check('"len": 1572864' in line, '1.5 MB file streamed as the body', line)
    tap('Multipart'); line = log_line('multipart', 90)
    check('"title:6"' in line and '"document:1572864"' in line and 'multipart/form-data' in line, 'multipart with a text part and a file part', line)
    tap('Download to file'); line = log_line('download', 90)
    check('3145728' in line and 'application/zip' in line, '3 MB response saved to a file', line)
    tap('Read saved file'); line = log_line('read')
    expected = __import__('base64').b64encode(bytes((1000000 + i) % 251 for i in range(16))).decode()
    check(line.endswith(expected), 'ranged read of the saved file', line)
    tap('Secure write'); check(log_line('store').endswith('204'), 'typed secure write')
    tap('Secure read'); line = log_line('load')
    check('200 count=3' in line, 'typed secure read', line)
    tap('Timer'); check(log_line('timer').endswith('200'), 'timer')
    subprocess.run(['adb', 'exec-out', 'screencap', '-p'], stdout=open(os.path.join(ROOT, 'build/ui/android-services.png'), 'wb'))
finally:
    tunnel.terminate()
    echo.terminate()
print('PASS tests/ui/android_services.py' if failures == 0 else f'{failures} failed')
sys.exit(1 if failures else 0)
