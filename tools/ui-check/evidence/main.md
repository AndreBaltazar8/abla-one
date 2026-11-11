# abla-one's main: each piece against the commit before it

abla-one's main at c241709e553aaf8c6de9183b9feab29df355fc9f holds the four pieces replayed on
0350816 (main before them), with abla-ui main 28524ebd53c03fc31ffd9b63be2f45e203af11de beside
it. Compiler ablac 0.2.48, in NovaKind's nix shell, without NovaKind's compiler slot, at
nice 19. Measured 2026-11-10 on a shared, loaded machine (load 36 to 55).

## abla-one's own screens (`NO_SUITE=1 tools/ui-check/check.sh check <piece> <commit before>`)

756 files per commit: nine screens, each as web document, web-client document, the test
backend's dump for five targets, the Android tree, and per-node boxes and paint frames for
desktop and e-paper at 19 widths.

| piece | from → to | captured files | capture program, `--fast` bytes |
|---|---|---|---|
| State and text widths | 0350816 → 7c910ea | identical | 1,151,360 → 1,158,576 (+7,216) |
| layout through abla-ui's flex | 7c910ea → 2804961 | identical | 1,158,576 → 1,234,232 (+75,656) |
| desktop keeps its layout | 2804961 → 95b9ce4 | identical | +0 |
| `$one` on abla-ui's grammar | 95b9ce4 → c241709 | identical | +0 |

## Random trees (`tools/ui-check/check.sh gen <piece> <commit before> 20000`)

Every node's box, 20,000 trees at three widths with and without a height: 2,222,670 boxes.

| piece | from → to | result |
|---|---|---|
| State and text widths | 0350816 → 7c910ea | identical |
| layout through abla-ui's flex | 7c910ea → 2804961 | identical |
| desktop keeps its layout | 2804961 → 95b9ce4 | identical |
| `$one` on abla-ui's grammar | 95b9ce4 → c241709 | identical |

## Timing (`tools/ui-check/check.sh cost 2804961 7c910ea`)

The layout piece against the commit before it: the gallery on the e-paper target through
`oneLayoutCached`, optimized builds, microseconds, best of 40, five runs, the two sides one
after the other on one core (load 36; the last three runs, which repeat):

| screen | first layout | the same tree again | after one change |
|---|---|---|---|
| `/` | 352 → 397 (+13%) | 171 → 169 | 188 → 184 |
| `/people` | 213–237 → 247–266 (+11 to +22%) | 97–115 → 97–109 | 95–112 → 101–107 |
| `/form/1` | 74–83 → 88–100 (+17 to +32%) | 45–51 → 45–53 | 44–51 → 45–52 |

A first layout through flex costs 11 to 30% more (45 µs on the biggest screen); a cached
re-layout and a re-layout after one change cost the same. The pin line gives the same
(`c187.md`). The per-screen times the captures print were taken with the load rising from 36
to 55 and with the two sides on cores of different speed: they are no result and are not given.

## Not verified

- The suite in these captures: skipped (`NO_SUITE=1`). `make test` on c241709: 50 passed,
  0 failed, run by the lead; `make ui-web-live` on the head before the last rebase: equal to
  main before it, run by b8.
- Instruction counts: `perf` is not installed on this machine; wall times only, on a machine
  that was not quiet.
- NovaKind against main: NovaKind pins abla-one by commit on the c1878461 line, not main.
