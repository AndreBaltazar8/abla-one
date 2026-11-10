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
