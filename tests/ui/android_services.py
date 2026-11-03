"""Android services test: real requests from the abla-mobile host to an echo
server on loopback through a private adb reverse mapping. Covers headers and methods, JSON,
bytes, a 500 KB in-memory body, a picked file streamed as the body and as a
multipart part, a 3 MB download saved to a file and read back by range,
typed secure storage and timers."""
import json, os, re, subprocess, sys, tempfile, time, xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PACKAGE = 'dev.abla.one.services'
os.makedirs(os.path.join(ROOT,"build/ui"),exist_ok=True)
failures = 0
emulator_lock = None

# The emulator, whatever else is plugged in: with a phone too, a bare adb stops, or drives the phone.
os.environ.setdefault('ANDROID_SERIAL', 'emulator-5554')
def adb(*args): return subprocess.check_output(['adb', *args]).decode(errors='replace')
def nodes():
    # While windows change, uiautomator can say "null root node", exit 0 and write nothing: there's no screen to read yet.
    for _ in range(10):
        if 'UI hierchary dumped' in adb('shell', 'uiautomator', 'dump', '/sdcard/one-ui.xml'): break
        time.sleep(0.5)
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

portfile = tempfile.NamedTemporaryFile()
echo = subprocess.Popen([sys.executable, os.path.join(ROOT, 'tests/ui/echo.py'), '0'], env=dict(os.environ, ONE_TEST_PORT_FILE=portfile.name))
for _ in range(100):
    if os.path.getsize(portfile.name): break
    if echo.poll() is not None: raise SystemExit('echo server failed to start')
    time.sleep(0.1)
echo_exe=os.path.realpath(f'/proc/{echo.pid}/exe')
port = open(portfile.name).read()
device_port = os.environ.get('ONE_SERVICES_DEVICE_PORT', '38147')
try:
    url = 'http://127.0.0.1:' + device_port
    open(os.path.join(ROOT, 'examples/services/echo_url.ab'), 'w').write(f'fun echoUrl(): string = "{url}"\n')
    if os.environ.get('ONE_SERVICES_SKIP_BUILD') != '1':
        subprocess.run([os.path.join(ROOT, 'tools/build-android.sh'), 'services'], check=True, stdout=subprocess.DEVNULL)
    if os.environ.get('ONE_SERVICES_TAKE_LOCK') == '1':
        import fcntl
        emulator_lock = open('/tmp/android-emulator.lock', 'a')
        fcntl.flock(emulator_lock, fcntl.LOCK_EX)
    if any(line.split()[1:2] == ['tcp:'+device_port] for line in adb('reverse','--list').splitlines()):
        raise SystemExit('fixture device port is already in use; choose ONE_SERVICES_DEVICE_PORT')
    adb('reverse', 'tcp:'+device_port, 'tcp:'+port)
    adb('install', '-r', os.path.join(ROOT, 'examples/services/android/android-app/build/outputs/apk/debug/android-app-debug.apk'))
    # A file for the document picker: 1.5 MB in Downloads.
    subprocess.run(['dd', 'if=/dev/urandom', 'of=/tmp/abla-one-upload.bin', 'bs=1024', 'count=1536'], check=True, capture_output=True)
    adb('push', '/tmp/abla-one-upload.bin', '/sdcard/Download/abla-one-upload.bin')
    adb('shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', 'file:///sdcard/Download/abla-one-upload.bin')
    dismiss_system_dialog()
    adb('shell', 'am', 'force-stop', PACKAGE)
    adb('shell', 'monkey', '-p', PACKAGE, '1')
    find('JSON PUT')

    if os.environ.get('ONE_EXPORT_ONLY') != '1':
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
    # A URL opened in another app would lack this header: /big rejects it.
    import hashlib
    adb('shell','rm','-f','/sdcard/Download/one-authenticated-export.bin')
    tap('Save response file')
    find('Save', tries=10) or find('SAVE', tries=3)
    save_node = find('Save', tries=2) or find('SAVE', tries=2)
    if save_node is None:
        subprocess.run(['adb','exec-out','screencap','-p'],stdout=open(os.path.join(ROOT,'build/ui/android-export-failure.png'),'wb'))
        raise SystemExit('FAIL system create-document save action missing')
    tap_node(save_node)
    check(log_line('export', 40).endswith('saved'), 'system document save completed')
    destination='/sdcard/Download/one-authenticated-export.bin'
    payload=subprocess.check_output(['adb','exec-out','cat',destination])
    check(hashlib.sha256(payload).digest()==hashlib.sha256(bytes(i%251 for i in range(3*1024*1024))).digest(), 'saved authenticated response is byte-identical')
    tap('Share response file')
    time.sleep(1)
    tree=nodes()
    check(any('one-authenticated-export' in (n.get('text') or '') or 'Sharing' in (n.get('text') or '') or 'Nearby' in (n.get('text') or '') for n in tree), 'Android share chooser receives opaque-file copy')
    check(not any('Bearer' in (n.get('text') or '') for n in tree), 'share UI contains no authentication header')
    adb('shell','input','keyevent','4')
    tap('Reject forged export')
    end=time.time()+20
    while time.time()<end:
        if log_line('export',2).endswith('failed'): break
        time.sleep(.2)
    check(log_line('export',2).endswith('failed'), 'unregistered handle and unsafe filename fail closed')
    adb('shell','rm',destination)
    tap('Secure write'); check(log_line('store').endswith('204'), 'typed secure write')
    tap('Secure read'); line = log_line('load')
    check('200 count=3' in line, 'typed secure read', line)
    tap('Timer'); check(log_line('timer').endswith('200'), 'timer')
    subprocess.run(['adb', 'exec-out', 'screencap', '-p'], stdout=open(os.path.join(ROOT, 'build/ui/android-services.png'), 'wb'))
finally:
    if emulator_lock is not None:
        subprocess.run(['adb','shell','am','force-stop',PACKAGE],capture_output=True)
        subprocess.run(['adb','shell','rm','-f','/sdcard/Download/abla-one-upload.bin'],capture_output=True)
        subprocess.run(['adb','reverse','--remove','tcp:'+device_port],capture_output=True)
        emulator_lock.close()
    for process, executable in [(echo,echo_exe)]:
        if process.poll() is None and os.path.realpath(f'/proc/{process.pid}/exe') == os.path.realpath(executable):
            process.terminate()
            process.wait(timeout=10)
    os.unlink(portfile.name)
    generated=os.path.join(ROOT,'examples/services/echo_url.ab')
    if os.path.isfile(generated): os.unlink(generated)
print('PASS tests/ui/android_services.py' if failures == 0 else f'{failures} failed')
sys.exit(1 if failures else 0)
