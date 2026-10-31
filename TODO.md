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

## Components

- [ ] `bitmap` draws on the raster targets (e-paper, canvas, desktop) and on web-document (an SVG), not on
      Android: `OneRenderer.kt` in abla-mobile doesn't know the kind. Nothing there uses it yet.

## Routes

- [ ] Android: a link that starts the app shows `/` for about half a second first. The host
      delivers it after the first tree; it could reach the first render instead.
- [ ] Desktop: no keyboard or mouse shortcut for back and forward (abla-graphics reports no
      modifier keys, and no back button). Only `services.back`.
- [ ] PaperMono: routes are covered by host tests and the firmware builds, in both modes;
      not yet run on the device.

## Toolchain

- [x] `tools/check-native-buffer-host` in abla-embedded: all 1207 fixtures pass (097ae16). Nine
      fixtures were stale; the IMU compile failure has a helper until ablac's `fixes` is merged.
      The PM1 fixture's boost bit now follows the drivers (M5IOE1 pin 3): not checked on hardware.

## ablac bugs seen (worked around, not fixed)

- abla-embedded's `src/m5stack/imu_orientation.ab` calls `imuAxisOrder` through a private helper to avoid a compiler bug fixed in ablac a7e1675d: drop it once a release has the fix.
- A named argument for a top-level function is lost before receiver names resolve: inside a method
  `f(a: int)`, `f(top = 5)` calls the method, though docs say a method must have that parameter.
- `abla/tls/hosted` and `httpsClient` still set no socket timeouts and don't guard SIGPIPE: any user
  but abla-s3 (which now avoids them) can die on a reset peer or hang on a silent one.
- `test-codegen-cache` can hit the same thread limit under load; it passes alone.
- A `when` over an f32 gives `when.match` for literal cases (documented).
- `test-codegen-units` can hit "Resource temporarily unavailable" under load; passes alone.
- ablac `make test` on `fixes`: 240 of 241 pass; only test-math-v8 fails (needs Node 22.14).

## Abla One bugs seen

- Thin mode wasn't linked or run after the compact storage change.
