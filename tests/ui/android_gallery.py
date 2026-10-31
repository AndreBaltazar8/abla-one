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

# A long form: the same shape as the previous screen, opened by a key.
def swipe_to_end():
    size = bounds(nodes()[0])
    x, top, bottom = size[2] // 2, size[3] * 3 // 4, size[3] // 4
    for _ in range(6):
        adb('shell', 'input', 'swipe', str(x), str(top), str(x), str(bottom), '150')
        time.sleep(0.2)
def field_text(label):
    # The field holding `label` as its description, whatever it shows.
    for n in nodes():
        if n.get('content-desc') == label or n.get('text') == label: return n.get('text')
    return None
tap('Componentes')
tap('Abrir formulário')
check(find('Nome') is not None, 'form opens')

# Fast typing: every keystroke reaches the app, even when the field loses focus
# straight after and the render can't keep up. Far more than the event queue holds.
typed = 'abcdefghij' * 16
tap('Nome')
adb('shell', 'input', 'text', typed)
tap('Valor')
shown = find('Nome: ' + typed, tries=40)
check(shown is not None, 'fast typing reaches the app')
check(find(typed, tries=4) is not None, 'fast typing stays in the field')

# Decimal keyboard: the system gets a decimal number field, and only a number stays.
# The first inputType in the dump is the current field's; later ones are history.
check(re.search(r'inputType=(0x[0-9a-f]+)', adb('shell', 'dumpsys', 'input_method')).group(1) == '0x2002', 'decimal keyboard requested')
adb('shell', 'input', 'text', '12,5a0.3')
check(find('Valor: 12,503', tries=20) is not None, 'decimal field keeps digits and one separator')
adb('shell', 'input', 'keyevent', '4')
time.sleep(0.5)

# A link renders, delivers its event and opens the browser.
adb('logcat', '-c')
tap('Abrir ligação (0)')
time.sleep(1.5)
log = adb('logcat', '-d', '-s', 'ActivityTaskManager:I')
check('android.intent.action.VIEW' in log and 'example.com' in log, 'link opens the browser')
adb('shell', 'am', 'start', '-n', PACKAGE + '/' + adb('shell', 'cmd', 'package', 'resolve-activity', '--brief', PACKAGE).strip().splitlines()[-1].split('/')[-1])
check(find('Abrir ligação (1)', tries=12) is not None, 'link press reached the app')

# Scroll: updates keep the position, and the next screen opens at the top.
swipe_to_end()
check(find('Formulário seguinte') is not None, 'form scrolls to its end')
tap('Notas')
adb('shell', 'input', 'text', 'fim')
time.sleep(1)
adb('shell', 'input', 'keyevent', '4')
time.sleep(0.5)
check(find('Notas: fim', tries=12) is not None and find('Formulário seguinte', tries=2) is not None, 'state changes keep the scroll position')
tap('Formulário seguinte')
check(find('Formulário 2') is not None, 'next form opens')
check(find('Nome') is not None and find('Formulário seguinte', tries=1) is None, 'next screen opens at the top')
print('PASS tests/ui/android_gallery.py' if failures == 0 else f'{failures} failed')
sys.exit(1 if failures else 0)
