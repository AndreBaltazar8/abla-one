"""Android UI test: installs the gallery APK on the running emulator, drives it
through UI Automator and checks what the Compose host rendered."""
import re, subprocess, sys, time, xml.etree.ElementTree as ET

APK = 'examples/gallery/android/android-app/build/outputs/apk/debug/android-app-debug.apk'
PACKAGE = 'dev.abla.one.gallery'
failures = 0

def adb(*args): return subprocess.check_output(['adb', *args]).decode(errors='replace')
def nodes():
    adb('shell', 'uiautomator', 'dump', '/sdcard/one-ui.xml')
    return list(ET.fromstring(adb('shell', 'cat', '/sdcard/one-ui.xml')).iter('node'))
def bounds(n): return list(map(int, re.findall(r'\d+', n.get('bounds', ''))))
def find(text, tries=8):
    for _ in range(tries):
        for n in nodes():
            if n.get('text') == text or n.get('content-desc') == text: return n
        time.sleep(0.5)
    return None
def tap(text):
    n = find(text)
    if n is None: raise SystemExit(f'FAIL control not found: {text}')
    b = bounds(n)
    adb('shell', 'input', 'tap', str((b[0] + b[2]) // 2), str((b[1] + b[3]) // 2))
    time.sleep(0.8)
def check(ok, label):
    global failures
    if not ok:
        failures += 1
        print('FAIL', label)

adb('install', '-r', APK)
adb('shell', 'am', 'force-stop', PACKAGE)
adb('shell', 'monkey', '-p', PACKAGE, '1')
check(find('Adicionar (0)') is not None, 'first render')
tap('Adicionar (0)'); tap('Adicionar (1)')
check(find('Adicionar (2)') is not None, 'press events update state')
todas = find('Todas'); b = bounds(todas) if todas is not None else [0, 0, 0, 0]
screen = bounds(nodes()[0])[2]
check(todas is not None and b[2] - b[0] < screen / 3, 'chips hug their label')
# The first page, as the other targets' screenshots show it.
subprocess.run(['adb', 'exec-out', 'screencap', '-p'], stdout=open('build/ui/android-gallery.png', 'wb'))
tap('Pessoas')
check(find('Maya Townsend') is not None, 'tab switch')
tap('Maya Townsend'); tap('Componentes')
check(find('Última pessoa aberta: Maya Townsend') is not None, 'list row press reached the app')
tap('Pesquisar pessoas')
adb('shell', 'input', 'text', 'ti')
time.sleep(0.8)
adb('shell', 'input', 'keyevent', '4')  # close the keyboard, which covers the tab bar
time.sleep(0.5)
tap('Pessoas')
check(find('Tiago Mendes') is not None and find('Sofia Costa', tries=1) is None, 'text input filters the list')
print('PASS tests/ui/android_gallery.py' if failures == 0 else f'{failures} failed')
sys.exit(1 if failures else 0)
