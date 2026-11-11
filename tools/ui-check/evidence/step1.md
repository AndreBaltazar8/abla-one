# Step 1: State and text widths are abla-ui's

abla-one `abla-ui-step1` 1e94aa2e5aaace5616cf114253e11f18ba347b30 (tag `novakind-ui-step1`)
with abla-ui ddba8a1272ebdcddbd72809de18b4c7ab99e8225, against abla-one
70db437b7e8bd4a2938db2ecadd7bb18741199dd (NovaKind's pin). Compiler ablac 0.2.48
(`~/.local/share/abla/v0.2.48/installed/bin/ablac`). NovaKind at main
56cae6cc84000b49715d4419517a1e7ab678228d with no source change; abla-ui pinned by a line in
the worktree's `toolchain/sibling-revisions`. Measured 2026-11-10 on a shared machine. Every
number here is from that NovaKind main; the section "Earlier" names what was measured on an
older one.

## NovaKind's gates (`tools/ui-check/novakind.sh <worktree> 1e94aa2 70db437`)

| what | result |
|---|---|
| `tools/claro_preview.ab`, `app.ab`, `tools/claro_landing_preview.ab`, `tests/native-render.ab` compile | 0 errors on both sides |
| landing and pricing pages | 16 files, 508,208 bytes: equal |
| signed-in previews | 300 files, 4,533,638 bytes: equal |
| every preview screen's layout boxes, node by node (360/411/1024/1280/1920 × en, pt-PT × android, desktop) | 600 files, 3,728,260 bytes: equal |
| `tests/native-render.ab` | 7 checks, 0 failed, on both sides (goldens 35,364 bytes) |
| 10,000 apps made, rendered and dropped: resident kB after each thousand | pin 108496 137880 138308 138412 139596 139668 139732 139740 139772 140216; step 1 108528 137976 138400 138504 139692 139760 139828 139836 139868 140308: flat on both |
| rendering the 300 preview pages, five runs, wall ms | pin 3976 3421 2761 3692 2793 (load 26); step 1 2446 2543 2762 2542 2426 (load 14): not slower; the pin ran under more load, so this is no speed-up |
| `--fast` sizes | `app` 46,447,496 → 46,458,184 (+10,688); `claro_preview` 21,028,952 → 21,035,000 (+6,048); `claro_landing_preview` 1,473,624 → 1,473,624 (+0) |

## Size the release way (`tools/ui-check/sizes.sh <worktree> 1e94aa2 70db437`)

`app.ab` by pinned-build without `--fast`: 30,913,304 → 30,918,920 bytes, +5,616 (text
28,688,959 → 28,694,473; data equal; bss 82,600 → 81,192). NovaKind's bar: under +100 KB.

## Android library (`build/novakind-tool build-android`, debug)

`libabla_app.so` as packaged in the APK (stripped): arm64-v8a 18,603,024 → 18,606,688
(+3,664); x86_64 22,649,456 → 22,653,744 (+4,288). Unstripped arm64-v8a 47,830,072 →
47,843,688 (+13,616). The APK holds the same 187 entries on both sides and differs only in
those two files. The APK file's own size is not given: Gradle packs a debug APK incrementally
and it came out 53,761,515 at the pin and 76,429,911 here with the same entries.

## Firmware, for the record (it gates nothing)

NovaKind's PaperMono firmware does not link at the pin on this NovaKind main with ablac 0.2.48
(`l32r: literal target out of range` in one Abla function), so there is no image to compare.
The Abla object `novakind-tool papermono build` makes, `build/papermono/novakind.o`:
14,585,900 → 14,595,288 bytes (+9,388; text 9,857,461 → 9,864,431, +6,970). Compiled only,
never flashed. In a worktree the tool's own CMake step cannot find `../../../abla-embedded`;
the ESP-IDF step was run on a copy with the pinned abla-embedded beside it.

## What this step went through

- With abla-ui's first State (a read subscribed the reader, mutating the State) NovaKind did
  not compile: 1,140 errors, every one a State read through an immutable receiver.
- With readers in a global table (abla-ui 3112c4c) it compiled and was byte-equal, but every
  State ever constructed left a table entry for good, and the optimized server grew 466,488
  bytes (each inlined read carried a check and a call).
- Now abla-one's State is abla-ui's plain one: a read is a load, a write moves the revision.

## Earlier, on NovaKind main fce24a3b83ded9b1ddafea4d0f8ee34b7292318f

abla-one 6bff293 (step 1 before its last commits) with the same abla-ui, against 70db437:
the same gates equal (previews 4,526,302 bytes, boxes 3,719,068 bytes), memory flat,
optimized `app` +5,184 bytes.

## Not verified

- abla-one's own `check.sh check` on this commit against 70db437: run by b8, not by this file's author.
- NovaKind's full suite, with the three live suites (`landing-web`, `app-journey`,
  `chat-records`), and the phone suites: not run here; NovaKind's side.
- A release APK: there is no command for one in NovaKind's tool; the debug build is what was measured.
- The firmware image's size: it does not link at the pin (above).
- Instruction counts: `perf` is not installed on this machine; wall times only.

## On NovaKind's current pin

NovaKind went back to pinning c1878461 after these runs (main 6a9533e1; 70db437 is one commit
on c1878461 that touches the live server's keep-alive only). The rebased head `abla-ui-step1-c187` f740839
against c1878461 passes the same gates; NovaKind's full, run on the last piece, is there too:
`c187.md`.
