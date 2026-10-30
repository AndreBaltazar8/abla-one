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

- [ ] Scroll faster still: 0.6-0.9 s of processing per swipe (mostly layout and the
      newly revealed strip), then 0.43 s on the panel.
- [ ] Taps under 100 ms of processing (about 300-450 ms now). Layout recalculates
      the whole screen on each tap (about 140 ms); memory cleanup adds about 160 ms on
      some taps.
- [ ] Don't lose touches during a panel refresh (renders sample between bands;
      a refresh blocks 0.2-0.7 s, and only one gesture is held at a time).
- [ ] Check grey fills on the real panel, especially after several fast refreshes:
      keep them, use a lighter shade, or go back to outlines.
- [ ] Offer a pressed look from a button's own pressed style (not an invert).

## Design

- [ ] Server/client boundary: one codebase; mark what stays on the server, and what
      the clients (web, mobile, embedded) get. See SPEC.
- [ ] Embedded modes as a compile flag: full (app on the device) and thin (the
      server sends the tree; the device does layout, scrolling and drawing).
- [ ] Per-target start screens: NovaKind's mobile and embedded builds open on login,
      the web on the landing page.

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
