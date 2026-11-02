"""Android UI test: installs the gallery APK on the running emulator, drives it
through UI Automator and checks what the Compose host rendered."""
import os, re, subprocess, sys, time, xml.etree.ElementTree as ET

APK = 'examples/gallery/android/android-app/build/outputs/apk/debug/android-app-debug.apk'
PACKAGE = 'dev.abla.one.gallery'
failures = 0

# The emulator, whatever else is plugged in: with a phone too, a bare adb stops, or drives the phone.
os.environ.setdefault('ANDROID_SERIAL', 'emulator-5554')
def adb(*args): return subprocess.check_output(['adb', *args]).decode(errors='replace')
def nodes():
    # While windows change, uiautomator can say "null root node", exit 0 and write nothing: there's no screen to read yet.
    for _ in range(10):
        if 'UI hierchary dumped' in adb('shell', 'uiautomator', 'dump', '/sdcard/one-ui.xml'): break
        time.sleep(0.5)
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
def dismiss_system_dialog():
    # The system's "isn't responding" dialog, seen for System UI after a boot under load, takes every tap and key meant for the app.
    if 'Application Not Responding' in adb('shell', 'dumpsys', 'window'):
        print('dismissed the system\'s "isn\'t responding" dialog')
        adb('shell', 'input', 'keyevent', '4')
        time.sleep(1)
def check(ok, label):
    global failures
    if not ok:
        failures += 1
        print('FAIL', label)

dismiss_system_dialog()
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
# In parts: `input text` stops after about 10 s, silently and with status 0, so on a slow emulator a whole string loses its tail
# before the app sees it: the field held a clean prefix each time, in 10.2 to 11.1 s, and whole strings took at most 7.8 s.
for part in range(0, len(typed), 40): adb('shell', 'input', 'text', typed[part:part + 40])
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
# The same activity comes back with its field focused, and the keyboard over the form.
if 'mInputShown=true' in adb('shell', 'dumpsys', 'input_method'):
    adb('shell', 'input', 'keyevent', '4')
    time.sleep(0.5)

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

# The system's back button walks the routes, and each screen is as it was left.
adb('shell', 'input', 'keyevent', '4')
check(find('Formulário 1') is not None, 'back: the previous route')
check(find('Formulário seguinte') is not None and find('Nome', tries=1) is None, 'back: its scroll is restored')
adb('shell', 'input', 'keyevent', '4')
# Nothing left to go back to: the app leaves, as Android apps do. Tabs were routes too.
def focused(): return [l for l in adb('shell', 'dumpsys', 'window').splitlines() if 'mCurrentFocus' in l][0]
presses = 0
while PACKAGE in focused() and presses < 16:
    adb('shell', 'input', 'keyevent', '4')
    time.sleep(1)
    presses += 1
check(PACKAGE not in focused() and presses > 1, f'back walks to the first entry, then leaves the app ({presses} presses)')

# A deep link reaches the app as a route, going in the same stack.
def link(url):
    adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', f"'{url}'", PACKAGE)
def activities():
    return sum(1 for l in adb('shell', 'dumpsys', 'activity', 'activities').splitlines() if 'Hist' in l and PACKAGE + '/org.abla.mobile.host.AblaMobileActivity' in l)
def raw_screen():
    data = subprocess.check_output(['adb', 'exec-out', 'screencap'])
    width, height = int.from_bytes(data[0:4], 'little'), int.from_bytes(data[4:8], 'little')
    return width, height, data[16:]
def pixel(screen, x, y):
    width, _, pixels = screen
    at = (y * width + x) * 4
    return tuple(pixels[at:at + 3])

# A link with the app open reaches the same activity: back at the first screen leaves.
adb('shell', 'am', 'force-stop', PACKAGE)
adb('shell', 'monkey', '-p', PACKAGE, '1')
home = find('Adicionar (0)')
check(home is not None, 'the app is open')
button = bounds(home)
link('abla-one-gallery://open/form/9')
check(find('Formulário 9', tries=12) is not None, 'a link with the app open opens its screen')
check(activities() == 1, f'in the same activity ({activities()})')
adb('shell', 'input', 'keyevent', '4')
check(find('Adicionar (0)') is not None, 'back: the screen before')
adb('shell', 'input', 'keyevent', '4')
time.sleep(1)
check(PACKAGE not in focused(), 'back again leaves, with no second home under it')

# A link that starts the app: never a frame of the first route. The primary button, near-black
# there, is where the form shows white.
adb('shell', 'am', 'force-stop', PACKAGE)
link('abla-one-gallery://open/form/7')
seen = 0
dark = 0
for _ in range(25):
    screen = raw_screen()
    seen += 1
    if pixel(screen, (button[0] + 12), (button[1] + button[3]) // 2) == (0x1f, 0x23, 0x28): dark += 1
check(dark == 0, f'a cold start by link shows only its route ({dark} of {seen} frames showed the first)')
check(find('Formulário 7', tries=12) is not None, 'a cold start by link opens its screen')
adb('shell', 'input', 'keyevent', '4')
check(find('Adicionar (0)') is not None, 'back from it: the first route')

# The dropdown on the bar: over the screen, closed by a press outside, the back button or a choice.
check(find('Estúdio Norte') is not None, 'the switcher is on the bar')
tap('Estúdio Norte')
check(find('Oficina Sul') is not None and find('Atelier Centro', tries=1) is not None, 'it opens')
subprocess.run(['adb', 'exec-out', 'screencap', '-p'], stdout=open('build/ui/android-popover.png', 'wb'))
adb('shell', 'input', 'keyevent', '4')
check(find('Oficina Sul', tries=3) is None and find('Adicionar (0)') is not None, 'the back button closes it, and stays')
tap('Estúdio Norte')
find('Oficina Sul')
# The button's left end, clear of the panel on the right.
adb('shell', 'input', 'tap', str(button[0] + 12), str((button[1] + button[3]) // 2))
time.sleep(0.8)
check(find('Oficina Sul', tries=3) is None and find('Adicionar (0)') is not None, 'a press outside closes it, and reaches nothing under it')
tap('Estúdio Norte')
tap('Oficina Sul')
check(find('Oficina Sul') is not None and find('Atelier Centro', tries=2) is None, 'a choice takes effect and closes it')

# A bitmap: sharp cells, nothing but black and white.
# All of it in view: at the end of the page, clear of the tab bar.
for _ in range(3):
    adb('shell', 'input', 'swipe', '300', '1400', '300', '400', '300')
    time.sleep(0.5)
code = find('Código de exemplo')
check(code is not None, 'the bitmap is on the screen, with its label')
if code is not None:
    b = bounds(code)
    screen = raw_screen()
    # Whole pixels per cell, centered in the box.
    cell = (b[2] - b[0]) // 7
    left, top = b[0] + (b[2] - b[0] - cell * 7) // 2, b[1] + (b[3] - b[1] - cell * 7) // 2
    colors = {pixel(screen, x, y) for x in range(left, left + cell * 7) for y in range(top, top + cell * 7)}
    # The cells are drawn without antialiasing; the emulator's composer still shifts edge pixels a little.
    check(all(max(c) <= 16 or min(c) >= 239 for c in colors), f'a bitmap is only black and white ({sorted(colors)[:6]})')
    check(pixel(screen, left + cell // 2, top + cell // 2) == (0, 0, 0) and pixel(screen, left + cell + cell // 2, top + cell + cell // 2) == (255, 255, 255), 'its cells are where they should be')
print('PASS tests/ui/android_gallery.py' if failures == 0 else f'{failures} failed')
sys.exit(1 if failures else 0)
