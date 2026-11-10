# Step 1: State and text widths are abla-ui's

abla-one `abla-ui-step1` 6bff2930d97b256c9ac2795c0908702856d4b1a1 with abla-ui
ddba8a1272ebdcddbd72809de18b4c7ab99e8225 (abla-ui main), against abla-one
70db437b7e8bd4a2938db2ecadd7bb18741199dd (NovaKind's intended pin, the keep-alive one).
Compiler ablac 0.2.48 (`~/.local/share/abla/v0.2.48/installed/bin/ablac`), NovaKind at main
fce24a3b83ded9b1ddafea4d0f8ee34b7292318f with no source change, abla-ui pinned by a line in
the worktree's `toolchain/sibling-revisions`. Measured 2026-11-10 on a shared machine.

## NovaKind's gates (`tools/ui-check/novakind.sh <worktree> 6bff293 70db437`)

| what | result |
|---|---|
| `tools/claro_preview.ab` and `app.ab` compile | 0 errors on both sides |
| landing and pricing pages | 16 files, 508,208 bytes: equal |
| signed-in previews | 300 files, 4,526,302 bytes: equal |
| every preview screen's layout boxes, node by node (360/411/1024/1280/1920 × en, pt-PT × android, desktop) | 600 files, 3,719,068 bytes: equal |
| `tests/native-render.ab` | 7 checks, 0 failed, on both sides (goldens 33,700 bytes) |
| 10,000 apps made, rendered and dropped: resident kB after each thousand | base 101168 137756 138272 138912 139292 140232 140528 140560 140576 140760; step 1 101132 137708 139188 139608 139732 140256 140260 140272 140348 140352: flat on both |
| rendering the 300 preview pages, five runs, wall ms | base 2381 2416 2344 2467 2613 (load 15); step 1 2277 2232 2211 2319 2810 (load 11 to 14): no difference outside the noise |
| `--fast` sizes | `app` 46,363,312 → 46,373,424 (+10,112); `claro_preview` 20,962,440 → 20,967,880 (+5,440); `claro_landing_preview` 1,470,728 → 1,503,968 (+33,240) |

## Size the release way (`tools/ui-check/sizes.sh <worktree> 6bff293 70db437`)

`app.ab` by pinned-build without `--fast`: 30,862,096 → 30,867,280 bytes, +5,184 (text
28,642,145 → 28,647,213; data equal; bss 80,616 → 83,736). NovaKind's bar: under +100 KB.

## What this step went through

- With abla-ui's first State (a read subscribed the reader, mutating the State) NovaKind did
  not compile: 1,140 errors, every one a State read through an immutable receiver.
- With readers in a global table (abla-ui 3112c4c) it compiled and was byte-equal, but every
  State ever constructed left a table entry for good, and the optimized server grew 466,488
  bytes (each inlined read carried a check and a call).
- Now abla-one's State is abla-ui's plain one: a read is a load, a write moves the revision.

## Not verified

- abla-one's own `check.sh check` on this commit against 70db437: run by b8, not by this file's author.
- The three live suites (`landing-web`, `app-journey`, `chat-records`): not run.
- The Android library's size: not measured.
- The PaperMono firmware's size: not measured.
- Instruction counts: `perf` is not installed on this machine; wall times only.
- NovaKind's full suite and the phone suites: NovaKind's side.
