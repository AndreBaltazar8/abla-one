# Step 2: layout is abla-ui's flex, by abla-one's rules

abla-one `abla-ui-step2`, code at 14638e1a49ba1d745b0eb3371e5abb6259a331a5 (the branch head
c4b109f adds `docs/abla-ui-layout.md` only), with abla-ui
82fbc4b1cdbcbdc5cb96673c2920627719344109 (on abla-ui's main), against abla-one
70db437b7e8bd4a2938db2ecadd7bb18741199dd (NovaKind's pin). Compiler ablac 0.2.48
(`~/.local/share/abla/v0.2.48/installed/bin/ablac`). NovaKind at main
56cae6cc84000b49715d4419517a1e7ab678228d with no source change; abla-ui pinned by a line in
the worktree's `toolchain/sibling-revisions`. Measured 2026-11-10 on a shared machine. Every
number here is from that NovaKind main; the section "Earlier" names what was measured on an
older one.

## NovaKind's gates (`tools/ui-check/novakind.sh <worktree> 14638e1 70db437`)

| what | result |
|---|---|
| `tools/claro_preview.ab`, `app.ab`, `tools/claro_landing_preview.ab`, `tests/native-render.ab` compile | 0 errors on both sides |
| landing and pricing pages | 16 files, 508,208 bytes: equal |
| signed-in previews | 300 files, 4,533,638 bytes: equal |
| every preview screen's layout boxes, node by node (360/411/1024/1280/1920 × en, pt-PT × android, desktop) | 600 files, 3,728,260 bytes: equal |
| `tests/native-render.ab` | 7 checks, 0 failed, on both sides (goldens 35,364 bytes) |
| 10,000 apps made, rendered and dropped: resident kB after each thousand | pin 108496 137880 138308 138412 139596 139668 139732 139740 139772 140216; step 2 107252 136636 137064 137168 138352 138424 138488 138500 138528 138968: flat on both |
| rendering the 300 preview pages, five runs, wall ms | pin 3976 3421 2761 3692 2793 (load 26); step 2 2451 2328 2248 2329 2349 (load 22): not slower; the pin ran under more load, so this is no speed-up |
| `--fast` sizes | `app` 46,447,496 → 46,538,832 (+91,336); `claro_preview` 21,028,952 → 21,013,456 (−15,496); `claro_landing_preview` 1,473,624 → 1,473,624 (+0) |

## Size the release way (`tools/ui-check/sizes.sh <worktree> 14638e1 70db437`)

`app.ab` by pinned-build without `--fast`: 30,913,304 → 30,989,680 bytes, +76,376 (text
28,688,959 → 28,763,909; data equal; bss 82,600 → 81,448). NovaKind's bar: under +100 KB.

## Android library (`build/novakind-tool build-android`, debug)

`libabla_app.so` as packaged in the APK (stripped): arm64-v8a 18,603,024 → 18,598,104
(−4,920); x86_64 22,649,456 → 22,640,680 (−8,776). Unstripped arm64-v8a 47,830,072 →
47,838,256 (+8,184). The APK holds the same 187 entries on both sides and differs only in
those two files; the APK file is 53,761,515 bytes on both.

## Firmware, for the record (it gates nothing)

NovaKind's PaperMono firmware does not link at the pin on this NovaKind main with ablac 0.2.48
(`l32r: literal target out of range` in one Abla function), so there is no image to compare.
The Abla object `novakind-tool papermono build` makes, `build/papermono/novakind.o`:
14,585,900 → 14,696,512 bytes (+110,612; text 9,857,461 → 9,929,435, +71,974). Compiled
only, never flashed.

## What this step went through

- The first version laid out again on every cached re-layout (it kept no boxes): 1.3 to 2.2
  times slower there. Now the cache keeps abla-ui's FlexTree, and cached re-layouts cost what
  they did at the pin. A first layout is still 11 to 30% slower than the pin's (measured by
  `check.sh cost` on abla-one's own screens), which the 300-page run above does not show.
- Random trees (`check.sh gen`, 20,000 trees, 2,222,670 boxes): identical to the pin, by b8
  on this commit and by this file's author on an earlier one (d91c350).

## Earlier, on NovaKind main fce24a3b83ded9b1ddafea4d0f8ee34b7292318f

abla-one ba40044 with abla-ui a79bfc1, against 70db437: optimized `app` +76,040 bytes.
abla-one d91c350, against the older pin c1878461: the same gates equal.

## Not verified

- abla-one's own `check.sh check` on this commit against 70db437: run by b8, not by this file's author.
- The phone suites: NovaKind's side (novakind-aa runs them).
- A release APK: there is no command for one in NovaKind's tool; the debug build is what was measured.
- The firmware image's size: it does not link at the pin (above).
- Instruction counts: `perf` is not installed on this machine; wall times only.
