# ui-check: is a revision of abla-one observably the same as another?

Written for abla-one's move onto abla-ui (State, text widths, then layout through abla-ui's
flex): each step must leave what abla-one produces unchanged. Everything here compares two
revisions of abla-one; the base defaults to NovaKind's pin. Nothing is checked out or
modified: a revision is exported with `git archive` into a temporary directory, with links to
its sibling repositories (`abla-mobile`, `abla-ui`, `ablac`) beside it. Uncommitted work is
not seen: commit first.

Environment, all optional: `ABLAC` (default `~/.local/share/abla/v0.2.48/installed/bin/ablac`,
NovaKind's pinned compiler), `NIX` (default NovaKind's `toolchain/shell.nix`), `SLOT` (default
NovaKind's `tools/compiler-slot`; `SLOT=` for none), `ABLA_UI` / `ABLA_MOBILE` (the sibling
checkouts to link; default the ones beside abla-one: point `ABLA_UI` at a worktree holding the
abla-ui commit the revision needs), `STORE` (default `~/.cache/abla-one-ui-check`). `NO_SUITE=1`
captures the screens without running the suite (a capture kept that way says so in `ABOUT`;
remove it from the store to take a full one).

A revision whose tree locks packages (abla-one's main: `abla.lock`, a `.abla/packages` rule in
the Makefile) has them prepared in the export with `ablac package vendor`, which fetches from
the network; and where the tree takes abla-mobile as a package (`src/mobile_source.ab`), the
capture program is made to import it the same way. `tests/state_size.sh` and
`tests/dsl_trees.sh` run with the suite where a revision has them.

## abla-one's own output: `check.sh`

    tools/ui-check/check.sh capture <rev>             capture <rev> into the store
    tools/ui-check/check.sh check <rev> [<base>]      capture <rev>, compare with <base>
    tools/ui-check/check.sh gen <rev> [<base> [N]]    N random trees (20000) laid out by both
    tools/ui-check/check.sh cost <rev> [<base>]       a cached re-layout's cost at both

- `capture` / `check` (`capture.ab`): nine screens (the gallery's `/`, `/people`, `/form/1`,
  `/form/2`; the services demo; four stress screens: text edge cases, growth and alignment,
  wrapping and scrolling rows, viewport states). Per screen: the web document and web-client
  document, the test backend's dump for five targets, the Android tree's JSON, and for the
  desktop and epaper targets at 19 widths (240 … 1501, either side of 360/480/600/760/1500)
  a file with one line per node (path, kind, x, y, w, h, content height, scroll, wrapped lines
  and their widths) and the paint frame as JSON: 756 files. Also `TESTS` (the Makefile's
  tests one at a time, `tests/layout_size.sh`, `tests/thin_config.sh`), `SIZES` (two `--fast`
  binaries) and `TIMING` (render + layout + paint + document per screen, best of 30, with the
  load: a guide only). `check` prints per screen `same` or the first differing file and
  lines, the tests that changed, sizes and timings; exit 0 only when every file is identical
  and no test went from ok to FAIL. A capture takes about ten minutes (the suite) and is kept
  in `$STORE/<commit>/`; it is locked per commit and moved into place whole, so runs may
  overlap. The baseline is regenerable: `check.sh capture <pin>`.
- `gen` (`gen.ab`): random trees from a seed (rows, columns, stacks, texts, spacers; growers,
  fixed, filling and hugging sizes, minima and maxima, odd gaps and paddings, alignments,
  wrapping rows, depth 5), each laid out at three widths with and without a height; every
  node's box must agree between the two revisions. A tree that differs is shrunk (nodes
  dropped while the two still differ) and printed with the differing boxes. Nothing stored.
- `cost` (`relayout.ab`): the gallery on the epaper target through `oneLayoutCached`:
  first layout, the same tree again, and after one change, microseconds, best of 40, three
  runs side by side, optimized builds. Timing on a shared machine: read several runs.

## NovaKind's screens: `novakind.sh`, `sizes.sh`

Both take a NovaKind worktree (never its main checkout; it must sit under
`.claude/worktrees/`) in which `make tool` has run, and build with
`build/novakind-tool pinned-build` at `ABLA_ONE_REV=<commit>` through NovaKind's compiler
slot. Pin abla-ui by adding `abla-ui <commit>` to the worktree's `toolchain/sibling-revisions`
(uncommitted): the result's `ABOUT` records the line. One run at a time per worktree.

    tools/ui-check/novakind.sh <novakind worktree> <rev> [<base>]
    tools/ui-check/sizes.sh    <novakind worktree> <rev> [<base>]

- `novakind.sh`, per revision, in this order (the first two fail fast if NovaKind no longer
  compiles unchanged): `tools/claro_preview.ab`, `app.ab`, `tools/claro_landing_preview.ab`,
  `boxes.ab` and `leak.ab` (copied into the worktree's `tools/` as `ui_check_boxes.ab` and
  `ui_check_leak.ab`: remove them afterwards), `tests/native-render.ab`. Compared file for
  file: the landing and pricing pages (16), the signed-in previews (300), every preview
  screen's layout boxes node by node at 360/411/1024/1280/1920 in both languages for the
  android and desktop targets (600 files), native-render's result against the goldens;
  `LEAK`: resident memory per thousand of 10,000 apps made, rendered and dropped (growth over
  the last five thousand more than 2 MB beyond the base's fails); `COST`: five timed runs of
  the 300-page render with the load; `--fast` sizes. Kept in `$STORE/novakind/<commit>/`
  (`FORCE=1` rebuilds). About 35 minutes for two fresh revisions.
- `sizes.sh`: `app.ab` built optimized (no `--fast`) at both, sizes, `size` sections and the
  25 symbols that grew most. The binaries stay in the worktree's `build/ui-check-app-opt.<commit>`.

Not scripted here: NovaKind's live suites (`novakind-tool test landing-web app-journey
chat-records` in a full-test hold, with the branch commit in the worktree's
`toolchain/abla-one-revision`), the Android library (`novakind-tool build-android`) and the
PaperMono firmware (`novakind-tool papermono build`; never flash).

Results for the conversion's two steps: `evidence/`.
