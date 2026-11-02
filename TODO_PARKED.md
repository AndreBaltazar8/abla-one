# Parked

Work the owner has set aside. Don't pick these up, flash anything for them, or plan around them until the owner
says so. When something is unparked, it moves back to `TODO.md`.

## PaperMono (parked 2026-11-02)

The owner doesn't plan to support PaperMono for now. Nobody flashes it, and its device checks wait.

- [ ] PaperMono: routes and popovers are covered by host tests and the firmware builds, in both modes;
      not yet run on the device, which wasn't connected on 2026-10-31. Needs its owner's taps: open and go back
      between routes, open a popover and tap outside it, in full and in thin mode.
- PaperMono thin mode after the compact storage change: it links (`make papermono-gallery MODE=thin
  ONE_HOST=...`, again on 2026-10-31 with the Wi-Fi change) and `make ui-thin` passes on the host, but it hasn't run
  on a device.
- PaperMono: joining Wi-Fi in the background is tested on the host and builds; it hasn't run on a device. Check
  boots join without "Sem ligação".
