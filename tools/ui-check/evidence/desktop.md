# Desktop: the layout is kept from frame to frame

abla-one `abla-ui-desktop` b40f35ab2c88cc5c2193e3659ded59b9d64e47df (tag `novakind-ui-desktop`)
with abla-ui 82fbc4b1cdbcbdc5cb96673c2920627719344109, against abla-one
70db437b7e8bd4a2938db2ecadd7bb18741199dd. Compiler ablac 0.2.48. NovaKind at main
56cae6cc84000b49715d4419517a1e7ab678228d with no source change. Measured 2026-11-10 on a
shared machine. NovaKind has since gone back to pinning c1878461; the same piece on that pin is in `c187.md`.

## NovaKind's gates (`tools/ui-check/novakind.sh <worktree> b40f35a 70db437`)

| what | result |
|---|---|
| landing and pricing pages | 16 files, 508,208 bytes: equal |
| signed-in previews | 300 files, 4,533,638 bytes: equal |
| every preview screen's layout boxes, node by node | 600 files, 3,728,260 bytes: equal |
| `tests/native-render.ab` | 7 checks, 0 failed, on both sides |
| 10,000 apps made, rendered and dropped: resident kB after each thousand | pin 108496 … 140216; here 109020 138404 138828 138932 140120 140188 140256 140264 140296 140736: flat on both |
| rendering the 300 preview pages, five runs, wall ms | pin 3976 3421 2761 3692 2793 (load 26); here 2585 2308 2329 2722 3293 (load 20): not slower |
| `--fast` sizes | `app` 46,447,496 → 46,538,872 (+91,376); `claro_preview` 21,028,952 → 21,013,720 (−15,232) |

Optimized `app` (`sizes.sh`): 30,913,304 → 30,989,680 bytes, +76,376: the same size as step 2's,
as the server has no desktop backend in it.

## Not verified

- NovaKind's full suite and phone suites on this pin: not run.
- abla-one's own `make test` with `tests/backends/desktop_frames.ab` on this commit: run by b8.
- Android library and firmware: not measured for this pin (the Android app has no desktop backend).

## On NovaKind's current pin

NovaKind went back to pinning c1878461 after these runs (main 6a9533e1; 70db437 is one commit
on c1878461 that touches the live server's keep-alive only). The rebased head `abla-ui-desktop-c187` eabb66a
against c1878461 passes the same gates; NovaKind's full, run on the last piece, is there too:
`c187.md`.
