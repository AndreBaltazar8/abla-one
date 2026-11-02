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
      not yet run on the device, which wasn't connected on 2026-10-31. Needs its owner's taps: open and go back
      between routes, open a popover and tap outside it, in full and in thin mode.

## Toolchain

- [x] `tools/check-native-buffer-host` in abla-embedded: all 1207 fixtures pass (097ae16). Nine
      fixtures were stale; the IMU compile failure has a helper until ablac's `fixes` is merged.
      The PM1 fixture's boost bit now follows the drivers (M5IOE1 pin 3): not checked on hardware.

## ablac bugs seen (worked around, not fixed)

- A `when` over an f32 gives `when.match` for literal cases (documented).
- A class's methods are all compiled, used or not, so what only one method reaches stays in every program that has the class (why `Style.wrap` is an extension). 0.2.29.
- `bootstrapLlvmAddressTaken` counts a function's value taken in an unreachable function, so it's in `abla_llvm_call_indirect`'s table and linked. It only holds now because the frontend drops unused top-level functions first. 0.2.29.
- A function value's or interface method's managed result can't be returned as it is (`ownership.managed-return-borrow-contract:return:nonfresh`) when the call takes parameters, nor can a nullable function type be called after a null check (`call.target`), or be assigned a function (`assignment.type`): `oneMeasureAnyRow` copies the box and holds its hooks in arrays. 0.2.29.

## Abla One bugs seen

- PaperMono thin mode after the compact storage change: it links (`make papermono-gallery MODE=thin
  ONE_HOST=...`, again on 2026-10-31 with the Wi-Fi change) and `make ui-thin` passes on the host, but it hasn't run
  on a device.
- PaperMono: joining Wi-Fi in the background is tested on the host and builds; it hasn't run on a device. Check
  boots join without "Sem ligação".

## Tools in Python

- [ ] `tools/vector2svg.py`, `tools/fonts.py` and `tools/icons-ab.py` are Python. NovaKind no longer calls
      `vector2svg.py` (`novakind-tool icons`, byte-identical on its 33 icons, could move here for other apps).
- Android: scrollRow ran on a phone through Crew (2026-11-01); wrap compiles but hasn't been seen on a device.
