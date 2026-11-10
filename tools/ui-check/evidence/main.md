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

## Timing: not settled

The captures time each screen (render, layout, paint and document; best of 30). With the load
rising from 36 to 55 through the four captures these are no result. As printed, layout's piece
against the one before it: gallery screens +11%, +9%, −11%, +47%; services +50%; the four
stress screens +40% to +76% (1 to 14 ms each), its capture taken at a quarter more load than
its base's. What is known from quieter runs on the pin line (`check.sh cost`): a first layout
through flex costs 11 to 30% more, a cached re-layout the same. This piece's timing was not
re-measured on a quiet machine.

## Not verified

- The suite in these captures: skipped (`NO_SUITE=1`). `make test` on c241709: 50 passed,
  0 failed, run by the lead; `make ui-web-live` on the head before the last rebase: equal to
  main before it, run by b8.
- The timing above.
- NovaKind against main: NovaKind pins abla-one by commit on the c1878461 line, not main.
