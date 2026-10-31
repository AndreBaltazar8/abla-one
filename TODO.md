# TODO

## Rules

- All open work on Abla One is tracked here. Add new tasks as they come up.
- Each big item gets at least one commit of its own, and can take several.
- This file can be committed at any time, along with the work or on its own.
- As soon as a task is completed, take it off this file, in the commit that
  finishes it. Git history is the record of what got done.
- Any bug or error seen goes here right away, even if it looks minor or unrelated, with what
  was seen and how to reproduce it. Don't only mention it in a report.
- Only list what is really open. A task is done when it is verified where it
  runs (on the device for device work), not just when it compiles.

## Routes

- [ ] PaperMono: routes and popovers are covered by host tests and the firmware builds, in both modes;
      not yet run on the device.

## Toolchain

- [x] `tools/check-native-buffer-host` in abla-embedded: all 1207 fixtures pass (097ae16). Nine
      fixtures were stale; the IMU compile failure has a helper until ablac's `fixes` is merged.
      The PM1 fixture's boost bit now follows the drivers (M5IOE1 pin 3): not checked on hardware.

## ablac bugs seen (worked around, not fixed)

- abla-embedded's `src/m5stack/imu_orientation.ab` calls `imuAxisOrder` through a private helper to avoid a compiler bug fixed in ablac a7e1675d: drop it once a release has the fix.
- A `when` over an f32 gives `when.match` for literal cases (documented).

## Abla One bugs seen

- PaperMono thin mode after the compact storage change: it links (`make papermono-gallery MODE=thin
  ONE_HOST=...`), but hasn't run on a device.
- `tests/ui/android_gallery.py`, first run after an emulator boot: "fast typing reaches the app" failed with
  the field stopped at 58 of 160 characters. It passed on each of the next runs; not reproduced since.
