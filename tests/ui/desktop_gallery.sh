#!/usr/bin/env bash
# Desktop UI test: the gallery desktop app in a virtual X server (Xvfb),
# driven with xdotool and captured with ImageMagick. Screenshots:
# build/ui/desktop-*.png. Checks pixels where the layout puts things.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec nix-shell -p xorg.xorgserver xdotool imagemagick --run '
set -euo pipefail
Xvfb :97 -screen 0 420x760x24 >/dev/null 2>&1 &
xvfb=$!
trap "kill \$app \$xvfb 2>/dev/null" EXIT
export DISPLAY=:97
unset WAYLAND_DISPLAY
sleep 1
./build/gallery-desktop &
app=$!
sleep 3
mkdir -p build/ui
import -window root build/ui/desktop-start.png
pixel() { convert build/ui/$1.png -format "%[hex:u.p{$2,$3}]" info:; }
fail=0
check() { if [ "$1" = "$2" ]; then echo "ok   $3"; else echo "FAIL $3 ($1 != $2)"; fail=1; fi; }
# The primary button (dark) sits at the top of the components page.
check "$(pixel desktop-start 40 128 | cut -c1-6)" "1F2328" "first frame drawn with the primary button"
xdotool mousemove 210 128 click 1
sleep 1
import -window root build/ui/desktop-pressed.png
check "$(compare -metric AE build/ui/desktop-start.png build/ui/desktop-pressed.png null: 2>&1 | cut -d" " -f1 | awk "{print (\$1 > 0) ? \"changed\" : \"same\"}")" "changed" "a click re-renders (the counter)"
xdotool mousemove 315 720 click 1
sleep 1
import -window root build/ui/desktop-people.png
check "$(pixel desktop-people 40 88 | cut -c1-6 | awk "{print (\$1 != \"FFFFFF\") ? \"avatar\" : \"blank\"}")" "avatar" "tab switch shows the people list"
# The dropdown on the bar. The chip is left of the bell; a click outside only closes it.
xdotool mousemove 315 720 click 1
sleep 1
xdotool mousemove 70 720 click 1
sleep 1
import -window root build/ui/desktop-home.png
xdotool mousemove 300 28 click 1
sleep 1
import -window root build/ui/desktop-popover.png
check "$(compare -metric AE build/ui/desktop-home.png build/ui/desktop-popover.png null: 2>&1 | cut -d" " -f1 | awk "{print (\$1 > 0) ? \"changed\" : \"same\"}")" "changed" "a popover opens"
xdotool key Escape
sleep 1
import -window root build/ui/desktop-popover-closed.png
check "$(compare -metric AE build/ui/desktop-home.png build/ui/desktop-popover-closed.png null: 2>&1 | cut -d" " -f1)" "0" "Escape closes it"
xdotool mousemove 300 28 click 1
sleep 1
xdotool mousemove 210 500 click 1
sleep 1
import -window root build/ui/desktop-popover-outside.png
check "$(compare -metric AE build/ui/desktop-home.png build/ui/desktop-popover-outside.png null: 2>&1 | cut -d" " -f1)" "0" "a click outside closes it and reaches nothing under it"
# Back and forward: the mouse buttons, and Alt with the arrows.
xdotool mousemove 315 720 click 1
sleep 1
xdotool mousemove 210 400 click 8
sleep 1
import -window root build/ui/desktop-back.png
check "$(compare -metric AE build/ui/desktop-home.png build/ui/desktop-back.png null: 2>&1 | cut -d" " -f1)" "0" "the mouse back button goes back"
xdotool click 9
sleep 1
import -window root build/ui/desktop-forward.png
check "$(compare -metric AE build/ui/desktop-people.png build/ui/desktop-forward.png null: 2>&1 | cut -d" " -f1)" "0" "the forward button goes forward"
xdotool key alt+Left
sleep 1
import -window root build/ui/desktop-alt-back.png
check "$(compare -metric AE build/ui/desktop-home.png build/ui/desktop-alt-back.png null: 2>&1 | cut -d" " -f1)" "0" "Alt+Left goes back"
xdotool key alt+Right
sleep 1
import -window root build/ui/desktop-alt-forward.png
check "$(compare -metric AE build/ui/desktop-people.png build/ui/desktop-alt-forward.png null: 2>&1 | cut -d" " -f1)" "0" "Alt+Right goes forward"
exit $fail
'
