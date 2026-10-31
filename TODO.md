# TODO

## Rules

- All open work on Abla One is tracked here. Add new tasks as they come up.
- Each big item gets at least one commit of its own, and can take several.
- This file can be committed at any time, along with the work or on its own.
- As soon as a task is completed, take it off this file, in the commit that
  finishes it. Git history is the record of what got done.
- Only list what is really open. A task is done when it is verified where it
  runs (on the device for device work), not just when it compiles.

## PaperMono (on the device)

- [ ] Taps under 100 ms of processing: about 110-130 ms when the screen changes, 45 ms
      when it doesn't (measured with injected taps; before: 300-450 ms). What is left
      is mostly drawing: a loop over array elements costs about 0.6 us each on the
      device (8-byte elements in PSRAM). Compact arrays for the surface and planes would
      also speed up swipes (0.5 s of processing).
- [ ] Check grey fills on the real panel, especially after several fast refreshes:
      keep them, use a lighter shade, or go back to outlines.
- [ ] Offer a pressed look from a button's own pressed style (not an invert).

## Design

The design is in SPEC section 16; these build it.

## Toolchain

- [ ] Better `f32` support in ablac: conversions, literals, math.
- [ ] Fix `tools/optimize-embedded-size` in abla-embedded (LLVM rejects `Oz`), which
      stops `tools/check-native-buffer-host` early.
- [ ] Add an ablac regression test for the Wasm runtime's reclaim thresholds under a
      memory limit (only covered by soak runs on the device so far).
- [ ] Decide on export global roots: a reference global with a constant initializer
      isn't rooted in a program entered only through exports.

## Screenshots

- [ ] Retake matching gallery screenshots on web, desktop and Android (the Android
      one shows a filtered Pessoas page; desktop has black bars).
