# Layout through abla-ui

abla-one's layout (`src/layout/layout.ab`) runs on abla-ui's flex (`abla-ui/src/flex.ab`).
abla-ui took abla-one's rules as its own defaults, so this file only maps nodes and styles
onto flex nodes and reads the boxes back. Any box that comes out different is a bug.

## The rules, one by one

Each rule is abla-one's code before the move (layout.ab at NovaKind's pin c1878461) and its
place in flex now. Every one is checked by `tools/ui-check/check.sh gen` (random trees, every
box) and `check` (the screens).

| # | Rule (abla-one) | In flex |
|---|---|---|
| 1 | Whole pixels; every division truncates (centring, `between`, grow shares) | `flexWhole`, `flexDiv`; the root's box is truncated too |
| 2 | The root fills the window | `layout()` gives the root the box as its fixed size |
| 3 | Size: what the parent decided, else a fixed size, else a fill width's room, else the content's | `givenW` / `givenH`; a fill height is only ever the parent's |
| 4 | Clamp: the maximum first, then the minimum, never below 0 | `clampW` / `clampH` |
| 5 | A column stretches by default (`align` empty or `stretch`); a child's own `alignSelf` wins; icons, images, bitmaps and spacers and a set width aren't stretched | FLEX_AUTO, `stretchesIn`, `stretchable`, `setNoStretch`, FLEX_HUG for `width=hug` |
| 6 | A hugging column measures its children, then measures the stretchable ones again at its widest | `column()`, after the first pass |
| 7 | A column's growers (`grow`, or a fill height as 1) share what's left only when its height is definite | `column()`, second pass |
| 8 | A row centres across by default; `stretch` measures a child again at the row's height | `row()` |
| 9 | A row's non-growers are measured in order, each in the room the earlier ones left; growers share the rest; a row with growers takes its inner width; justify only without growers | `row()` |
| 10 | Text: room is the width (or the room) less padding, at least 1; lines by oneWrap; height lines × lineHeight (size × 14 / 10 unless set) | the measurer here (`OneFlexMeasure`); flex floors the room at 1 |
| 11 | Per-kind sizes: icon 24, image / bitmap 40 (or `size`), divider all the width × 1, spacer its `size` both ways, input all the width × its rows | `setIntrinsic` here; an input is measured for its rows |
| 12 | Stack: one `align` places children both ways; a fill child takes the stack's size when it has one | `stack()` |
| 13 | Popover: the anchor takes the room; the panel (only the second child) gets the window less 16 | FLEX_POPOVER; this file adds only the first two children |
| 14 | Wrap row: own sizes, a new line when the next doesn't fit, `gap` both ways | `wrapRow()` (flex's `crossGap` is not used by these rules) |
| 15 | Scroll row: children at their own widths in 1,000,000 px, centred down, as wide as its room | `scrollRow()`; the offset and contentH = content width are set here |
| 16 | Scroll / feed: takes the room when no height is set, children in 1,000,000 px down, no justify; offsets per node path; a feed opens at the bottom | FLEX_F_SCROLL_Y; offsets here (`oneFlexBox`) |
| 17 | contentH per kind: a column's content plus padding, a row's height, 0 for a wrap row, leaves, stacks and popovers | `oneFlexBox` |
| 18 | Wrap rows and scrollRow are opt-in (`oneUseWrapRows`, `oneUseScrollRows`); without, a plain row that says so | flags here |

Text cut with `maxLines` ends in an ellipsis that depends on the exact room, so such text
(and an input) is measured again for any room other than its last (`setMeasureExact`). Other
text reuses its lines for any room between its width and its last room.

## One rule that looks like an accident

A container whose size the parent decided (stretch, fill, grow) keeps that size without its
own min / max. Only a leaf is clamped then, because a column or row given a width returns it
unclamped. An example: a column with `width=fill maxWidth=120` in a 300 px column is 300 wide,
while a text with the same style is 120. This is kept for identity and listed for a decision
with NovaKind. flex_test's oneClamps reproduces it.

## Caching

`oneLayoutCached` keeps the flex tree in `OneLayoutCache` (`flex`). The hashed tree is matched
onto it by position. A node whose hash is unchanged keeps its flex node and subtree untouched;
flex then answers that subtree from its own per-node cache. A changed node is set again (a
setter that keeps a value marks nothing). The box of a subtree with no scroll area, where
nothing was laid out (flex's `freshAt`) or synced since the box was built, is reused, as the
pin's box cache did. Resolved styles and wrapped text are cached as before.

## Cost

A re-layout through `oneLayoutCached` (the same tree again, or after a tap) costs what it
cost at the pin. A first layout costs more, because two trees are built: abla-one's nodes, and
a flex node for each. This was measured with 9b's relayout harness (`tools/ui-check/relayout.ab`:
the gallery on the e-paper target at 400 × 300, layout and paint frame, optimized, ablac
0.2.48), alternating pin and branch runs, best of 40, µs:

| Screen | Pin | Through flex |
|---|---|---|
| `/` | 352 | 394 (+11%) |
| `/people` | 246 | 255 (+4%) |
| `/form/1` | 77 | 93 (+21%, +16 µs) |

Phase timers on a first layout place the difference. Resolving styles and wrapping text cost
what they did. A new cache with an empty flex tree costs 1.5 µs. The rest is per node: about
300 ns to build a flex node (its columns and the kept arrays) and about 250 ns to configure it
(some 20 setters fed from the resolved style). It shows most on a small screen.

Where a first layout happens: the desktop and e-paper backends once per screen (then cached),
the web session only in canvas mode (`?render=canvas`, once per render, uncached), and tests.
The web document backend and Android leave layout to the platform. NovaKind's requests are web
documents: in NovaKind only tests/native-render.ab lays out.

Not done, and why. Keeping one flex tree across uncached `oneLayout` calls would remove the
node building, but it would put hidden state shared by every session behind a pure call on
the server. Trimming flex's per-node columns would mean refactoring code that has just been
checked identical. Either is a separate step with its own identity check, if canvas sessions
ever matter.

## What abla-one shares with abla-ui, and what it doesn't

abla-one's apps are written against abla-one's API. `render(var ui: Ui): Node` returns a
`Node`. Styles are strings (`set("gap", "8")`, tokens like `"@surface"`, `.on("web", …)`,
`upTo` / `from`). Handlers are int ids from `ui.press { }` / `ui.change { }`, delivered by
rendering again in dispatch mode. That API stays as it is: NovaKind's screens are written
against it.

Shared, on abla-ui's code:

| Part | What abla-one uses | Pin |
|---|---|---|
| State | abla-ui's plain `State` (src/revision.ab): a read is a load, a write moves the revision | step 1 |
| Text measurement | abla-ui's `TableFont` over Inter's tables, built on first use | step 1 |
| Layout | abla-ui's flex, with abla-one's rules as its defaults (this file) | step 2 |
| Desktop frames | the layout kept between frames (`oneLayoutCached`) | desktop |
| Tag syntax | `$one` is an element table on abla-ui's grammar (src/grammar.ab) | step 3 |

Left as they are, on purpose:

- **Node and Style.** These are not replaced by abla-ui's `El` and typed `Style`. That would
  change every app's source: render's return type, every kit call's event argument, string
  styles. The alternative is a layer that rebuilds `Node` on every render, which costs time and
  server bytes for nothing.
- **Test backend** (src/backends/test.ab): a dump of the tree; nothing to retain.
- **Web document** (web_document.ab): rendered once per request; a retained tree only adds
  work.
- **Thin host** (thin_host.ab): one comparison of the tree's JSON already says when to send.
- **E-paper** (epaper.ab): it already lays out through the kept cache and repaints dirty
  rectangles.

Not done (a decision for André and NovaKind), and what each would take:

- **Android, incremental updates.** Today every render sends the whole tree as JSON
  (android.ab:51), and the host parses it whole (UiTree.fromJson). With increments, abla-one
  would keep each session's previous tree, compare the new one by key path, and send records
  (add, remove, move, properties) against stable node ids; the host would apply them to its
  UiNode tree. That means:
  - a protocol change on both sides (one APK, so no old/new compatibility needed);
  - Kotlin in abla-mobile;
  - novakind-aa's review of the interface;
  - the fingerprint work (abla-mobile perf/recompose-694) on its main first;
  - todo 732's lost-change handling designed in: a record that lands nowhere is reported, and
    the host asks for a whole tree.

  Gate: the 82 phone suites, android-recompose's bound, per-update timings.
- **Live web, patches by node.** Today the session renders the whole HTML and sends all of it
  when the string differs (web_session.ab:766); the page morphs its DOM by `data-one` keys.
  With patches by node, the same key-path comparison as Android's would send only the changed
  subtrees, as a new, versioned message kind (pages that don't know it keep whole HTML). That
  means:
  - projects-e8 for the protocol;
  - room in the server's size budget: step 2 already uses 76 KB of the 100 KB allowed.

  Gate: a recorded session's patch bytes old/new, the keep-alive and recovery suites.
