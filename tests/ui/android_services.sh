#!/usr/bin/env bash
# Android services test, the setup around build/android-services (tests/ui/android_services.ab, which drives the app):
# starts the echo server (build/echo, make echo-server) on a free port, builds and installs the services APK, maps a
# device port to the echo server with adb reverse, puts a 1.5 MB file in Downloads for the document picker, runs the
# driver, and cleans up. Run it holding the emulator lock (make ui-android-services does, flock).
#
# ONE_SERVICES_DEVICE_PORT (default 38147): the device-side port of the reverse mapping.
# ONE_SERVICES_SKIP_BUILD=1: reuse the APK. ONE_SERVICES_TAKE_LOCK=1: take ${ANDROID_EMULATOR_LOCK:-/tmp/android-emulator.lock}
# here, after the build. ONE_EXPORT_ONLY=1: only the export checks.
set -euo pipefail
cd "$(dirname "$0")/../.."
package=dev.abla.one.services
# The emulator, whatever else is plugged in: with a phone too, a bare adb stops, or drives the phone.
export ANDROID_SERIAL=${ANDROID_SERIAL:-emulator-5554}
device_port=${ONE_SERVICES_DEVICE_PORT:-38147}
portfile=$(mktemp)
upload=$(mktemp)
generated=examples/services/echo_url.ab
reversed=0
export ONE_TEST_PORT_FILE="$portfile"
./build/echo 0 &
echo_pid=$!
echo_exe=$(realpath build/echo)
cleanup() {
  if [ "$reversed" = 1 ]; then
    adb shell am force-stop "$package" >/dev/null 2>&1 || true
    adb shell rm -f /sdcard/Download/abla-one-upload.bin >/dev/null 2>&1 || true
    adb reverse --remove "tcp:$device_port" >/dev/null 2>&1 || true
  fi
  if [ "$(readlink "/proc/$echo_pid/exe" 2>/dev/null || true)" = "$echo_exe" ]; then
    kill -TERM "$echo_pid" 2>/dev/null || true
    wait "$echo_pid" 2>/dev/null || true
  fi
  rm -f "$portfile" "$upload" "$generated"
}
trap cleanup EXIT
for _ in $(seq 100); do
  [ -s "$portfile" ] && break
  [ -e "/proc/$echo_pid/exe" ] || { echo "echo server failed to start" >&2; exit 1; }
  sleep 0.1
done
port=$(cat "$portfile")
printf 'fun echoUrl(): string = "http://127.0.0.1:%s"\n' "$device_port" > "$generated"
if [ "${ONE_SERVICES_SKIP_BUILD:-}" != 1 ]; then
  tools/build-android.sh services >/dev/null
fi
if [ "${ONE_SERVICES_TAKE_LOCK:-}" = 1 ]; then
  exec 9>>"${ANDROID_EMULATOR_LOCK:-/tmp/android-emulator.lock}"
  flock 9
fi
if adb reverse --list | awk -v p="tcp:$device_port" '$2 == p { found = 1 } END { exit !found }'; then
  echo "fixture device port is already in use; choose ONE_SERVICES_DEVICE_PORT" >&2
  exit 1
fi
adb reverse "tcp:$device_port" "tcp:$port"
reversed=1
adb install -r examples/services/android/android-app/build/outputs/apk/debug/android-app-debug.apk
# A file for the document picker: 1.5 MB in Downloads.
dd if=/dev/urandom of="$upload" bs=1024 count=1536 2>/dev/null
adb push "$upload" /sdcard/Download/abla-one-upload.bin
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/abla-one-upload.bin
mkdir -p build/ui
./build/android-services
