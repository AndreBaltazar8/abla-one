# Grammar (step 3): `$one` is an element table on abla-ui's tag grammar

abla-one `abla-ui-grammar` c29e33f54be8b1e71b48eebe79e0fc41913f94b1 with abla-ui
dfb2417a2a34d273c6622b572801390def6747de, against abla-one
70db437b7e8bd4a2938db2ecadd7bb18741199dd. Compiler ablac 0.2.48. NovaKind at main
56cae6cc84000b49715d4419517a1e7ab678228d with no source change. Measured 2026-11-10 on a
shared machine. NovaKind has since gone back to pinning c1878461; see "Not verified".

## NovaKind's gates (`tools/ui-check/novakind.sh <worktree> c29e33f 70db437`)

| what | result |
|---|---|
| landing and pricing pages | 16 files, 508,208 bytes: equal |
| signed-in previews | 300 files, 4,533,638 bytes: equal |
| every preview screen's layout boxes, node by node | 600 files, 3,728,260 bytes: equal |
| `tests/native-render.ab` | 7 checks, 0 failed, on both sides |
| 10,000 apps made, rendered and dropped: resident kB after each thousand | pin 108496 … 140216; here 109020 138464 138892 138996 140184 140252 140316 140324 140356 140796: flat on both |
| `--fast` sizes | `app` 46,447,496 → 46,538,872 (+91,376); `claro_preview` 21,028,952 → 21,013,720 (−15,232): byte counts equal to the desktop pin's |

Optimized `app` (`sizes.sh`): 30,913,304 → 30,989,680 bytes, +76,376, the same as step 2's and desktop's.

## Timing: not settled

The 300 preview pages took 3807 3669 4089 4389 4152 ms here at load 64, against the pin's
3976 3421 2761 3692 2793 ms at load 26. That is no comparison. The binaries have the sizes of
the desktop pin's, which ran 2585 2308 2329 2722 3293 ms at load 20, and the grammar works at
compile time; a rerun on a quieter machine was not done.

## Not verified

- The timing above.
- Against c1878461 on NovaKind main 6a9533e1 (the rebased head `abla-ui-grammar-c187` 9cd7582): not run.
- NovaKind's full suite and phone suites on this pin: not run.
- abla-one's own `make test` with `tests/dsl_trees.sh` on this commit: run by b8.
- Android library and firmware: not measured for this pin.
