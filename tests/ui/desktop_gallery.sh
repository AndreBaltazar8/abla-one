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
exit $fail
'
