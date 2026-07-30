# READY — #344 (breadcrumb hover highlight with one-cell side padding)

- Commit: `817d9bf348b5d0b959b4a23badf6ab1ef45efab7` on `fleet/344-breadcrumb-hover-highlight-padding`
- Gate: `merge-gate: ALL-PASS`, `GATE_EXIT=0`, `pre-commit: merge-gate GREEN — commit allowed.`
- Tree: clean. Not pushed. The conductor lands.

## What the task asked for

Hovering a breadcrumb folder segment must paint a background one cell beyond
the text on the left and one on the right. The separators must stay
unhighlighted. Nothing may move on hover. The whole row moves one column
right, once and always, so the first segment has room for its left cell.

## Driven evidence — before and after

The probe is
[probe-344-breadcrumb-hover-cells.ts](probe-344-breadcrumb-hover-cells.ts)
(committed in this folder). It builds a workspace `invar/subfolder/sub2/leaf.ts`,
opens the leaf file, and hovers each segment in a 160-column PTY. `text` is the
breadcrumb row. `high` marks every cell whose background is the theme hover
token.

BEFORE (base commit `e95f0c22`):

```
breadcrumb row=4 editorColumnLeft=37 firstGlyphColumn=38 leadingPadColumns=1
no hover
  text |▎ ≡ │                            ⊙ │  invar › subfolder › sub2 › leaf.ts                                      |
  high |..............................................................................................................|
hover "invar" textSpan=[38,43)
  text |▎ ≡ │                            ⊙ │  invar › subfolder › sub2 › leaf.ts                                      |
  high |......................................#####...................................................................|
hover "subfolder" textSpan=[46,55)
  text |▎ ≡ │                            ⊙ │  invar › subfolder › sub2 › leaf.ts                                      |
  high |..............................................#########.......................................................|
hover "sub2" textSpan=[58,62)
  text |▎ ≡ │                            ⊙ │  invar › subfolder › sub2 › leaf.ts                                      |
  high |..........................................................####................................................|
hover "leaf.ts" textSpan=[65,72)
  text |▎ ≡ │                            ⊙ │  invar › subfolder › sub2 › leaf.ts                                      |
  high |.................................................................#######......................................|
```

The highlight covered the text and nothing more.

AFTER (commit `817d9bf3`):

```
breadcrumb row=4 editorColumnLeft=37 firstGlyphColumn=39 leadingPadColumns=2
no hover
  text |▎ ≡ │                            ⊙ │   invar › subfolder › sub2 › leaf.ts                                     |
  high |..............................................................................................................|
hover "invar" textSpan=[39,44)
  text |▎ ≡ │                            ⊙ │   invar › subfolder › sub2 › leaf.ts                                     |
  high |......................................#######.................................................................|
hover "subfolder" textSpan=[47,56)
  text |▎ ≡ │                            ⊙ │   invar › subfolder › sub2 › leaf.ts                                     |
  high |..............................................###########.....................................................|
hover "sub2" textSpan=[59,63)
  text |▎ ≡ │                            ⊙ │   invar › subfolder › sub2 › leaf.ts                                     |
  high |..........................................................######..............................................|
hover "leaf.ts" textSpan=[66,73)
  text |▎ ≡ │                            ⊙ │   invar › subfolder › sub2 › leaf.ts                                     |
  high |.................................................................#########....................................|
```

Every highlight now starts one cell before the text and ends one cell after
it. The first segment is included: its highlight starts at column 38, one
cell before its text at 39.

The separators stay clean. For `invar` the highlight ends at column 44, which
is the space before the `›` at column 45. The `›` cell itself is never
painted, and the next segment's highlight starts at column 46.

## The one-column shift — proof

| quantity | before | after |
|---|---|---|
| editor column left edge | 37 | 37 |
| first breadcrumb glyph | 38 | 39 |
| `invar` text start | 38 | 39 |
| first `›` | 44 | 45 |
| `subfolder` text start | 46 | 47 |
| `sub2` text start | 58 | 59 |
| `leaf.ts` text start | 65 | 66 |

Every segment and every separator moved by exactly one column, and by the same
one column. Nothing moved by two. The pad cells exist whether or not the mouse
is on the row, so the `text` line is byte-identical with the hover on and off.
The smoke asserts that directly: *moves nothing on the row while "…" is
hovered*.

## Hover geometry — one generator

The pad cells belong to the CRUMB, not to the row.
[TabBarRenderer.renderBreadcrumb](../../../../src/modules/ui/TabBarRenderer.ts)
now emits ONE chunk per crumb, holding
`Breadcrumb.Class.paddedLabel(label)` — the label with its own pad cell on
each side. The same two numbers that place that chunk become the crumb's
`start` and `end`:

```ts
const paddedLabel = Breadcrumb.Class.paddedLabel(crumb.label);
const start = column;
const end = column + TextCoordinates.Class.lineWidth(paddedLabel);
```

Three readers, one span:

- the paint — `bg(palette.cursorLine)` wraps that one chunk, so the background
  covers exactly the padded label;
- the hit test — `TabBar.breadcrumbSegmentAt` matches `start <= column < end`,
  so the pad cells are part of the segment and hovering or clicking a pad cell
  selects the same crumb;
- the picker anchor — `BreadcrumbPicker.show` anchors on `segment.start`.

There is no second measurement anywhere. The separator is now a bare `›` glyph
emitted BETWEEN two padded crumbs. It belongs to no crumb chunk and lies in no
crumb span, which is why it can neither take the background nor answer a click.

The picker anchor column did not change. The segment start moved one cell left
(from the text to the pad) at the same moment the text moved one column right,
so the two cancel. The popup opens where it always did.

The path fit reserve grew from two columns to three
(`pathAreaWidth - 2 - HOVER_PAD_COLUMNS`), which pays for the last segment's
right pad.

Themes: the change reuses `palette.cursorLine`, the token the tab badge and the
title actions already use for hover. No colour is written in behaviour code.
The smoke drives the hover in the dark theme AND after a live switch to the
light theme.

## Contract — what is now gated

[smoke-breadcrumb-harness.ts](../../../../scripts/harness/smoke-breadcrumb-harness.ts)
was extended, as the brief asked; no new smoke was added. At 10 lines and at
100,000 lines, in the dark theme and in the live light theme, it now requires:

- the row prefix is exactly two columns — one margin cell plus the first
  segment's pad;
- every cell from `textStart - 1` to `textEnd + 1` carries the theme hover
  background;
- the cells one step outside that span do NOT — this is the same cell as the
  `›` on the inner side, so it doubles as the separator check;
- the separator cell holds `›` and stays unpainted while a neighbour is
  hovered;
- the row text is unchanged from the resting row while hovering;
- clicking the first segment's LEFT PAD cell opens the folder picker
  (`boundedListPopupOpen`), and Escape closes it — click behaviour is
  unchanged, and the pad is part of the target.

Each segment is hovered twice: once on the middle of its text, once on its
left pad cell. The pad hover is what proves the hit test reads the span the
paint used. The highlight is cleared between the two hovers, so each wait
starts from a screen where its condition is FALSE. No wait is already true
before its action.

The smoke states the one-cell promise as its OWN literal
(`const HOVER_PAD_COLUMNS = 1`). It deliberately does not read the renderer's
constant, because that would only prove the code agrees with itself.

The contract line in
[behavioral-contracts.sh](../../../../scripts/behavioral-contracts.sh) now
names the hover geometry, so the coverage is findable from the gate output.

### Positive control

Plant: keep the padded layout but paint the background over the BARE label
(three chunks: pad, label, pad; the background on the label only). This is
exactly the regression the assertion exists to catch — the row text does not
change, only the painted span shrinks.

Red:

```
error: Timed out waiting for grid condition: 10-line dark theme highlights
"tui-breadcrumb-10-znfZZB" when the mouse rests on its text
```

The plant was removed and the file restored before the commit.

A second plant, `HOVER_PAD_COLUMNS = 0`, also turns the smoke red, at the
earlier assertion *10-line breadcrumb paints in the dark theme* — with no pads
the row reads `root›huge.ts` and the spaced marker never appears.

## Verification pass

| check | result |
|---|---|
| `bun scripts/harness/smoke-breadcrumb-harness.ts` | ALL-PASS |
| `bun run typecheck` | exit 0 |
| `bun test src/modules/ui/` | 243 pass, 0 fail |
| `check_invariants.mjs --all --refs` | 0 problems |
| `bash scripts/conventions-gate.sh` | PASS |
| `bun scripts/harness/smoke-tabs-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-bounded-list-popup-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-navigation-history-harness.ts` | ALL-PASS |
| `bun scripts/harness/smoke-markdown-harness.ts` | ALL-PASS |
| `scripts/merge-gate.sh` through the commit hook | ALL-PASS, `GATE_EXIT=0` |

Scale parity: the smoke drives the same gestures at 10 lines and at 100,000
lines. The breadcrumb geometry is a function of the path and the bar width
only, so the two are identical.

Narrow geometry: `bun run drive --geometry 70x24` collapses the path to `…`
inside a four-column editor slot with no overflow and no wrap.

## Invariants in scope — record by record

**[src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — Tab bars share paint and hit geometry.**
UPHELD, and NEEDS REFINEMENT of scope. The record requires that one column
walk determines both the styled chunks and the hit segments. The breadcrumb
walk now does more of that than before: the pad cells are painted by the
crumb's own chunk and reported by the crumb's own span, so the record's
*impossible if true* clause — "a click coordinate resolving to a different
segment than the glyph at that cell" — still holds cell for cell. The
refinement owed is the SCOPE line, which names only the "horizontal workspace
and buffer tab strips". `renderBreadcrumb` is a third consumer of the same
one-walk property in the same class, and no record names it. See Bycatch.

**[src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — Bounded list popups share paint and hit
geometry.** UPHELD, untouched. The popup computes its own geometry from the
anchor. The anchor column is numerically unchanged.

**[src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — Bounded list interactions live in one
popup.** UPHELD, untouched. `BreadcrumbPicker` still supplies only items and
its domain action.

**[src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) — Popup hierarchy is mouse and keyboard
reachable.** UPHELD, untouched. `parentDirectoryOf` and the `..` row are not
in this diff. The smoke opens the workspace-root picker, where the record
requires NO parent row, and closes it with Escape.

**[src/modules/theme/theme.invariants.md](../../../../src/modules/theme/theme.invariants.md) — Appearance comes only from theme
data.** UPHELD. The highlight reads `palette.cursorLine`, the existing hover
token, and the smoke checks the painted value against the dark palette and
then against the light palette after a live switch.

**[src/modules/theme/theme.invariants.md](../../../../src/modules/theme/theme.invariants.md) — One mark has one reserved
meaning.** UPHELD. The `›` separator glyph and the icon column are untouched.
Its *impossible if true* names "a breadcrumb filename starting in a different
column because of its icon" — the shift here is one uniform column for the
whole row and comes from the pad, not from an icon.

**[src/modules/markdown/markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md) — the Markdown preview record,
component *The contributed action yields no columns*.** UPHELD. The path now
reserves one more column, so it truncates one character earlier; the
right-aligned action keeps its cells. Driven: the markdown smoke passes
*wide view keeps the preview action at the breadcrumb right edge* and the
narrow-view twin, at 500 and 100,000 lines.

**[src/modules/workspace/workspace.invariants.md](../../../../src/modules/workspace/workspace.invariants.md) — The editor surface answers
capabilities, not plugin modes.** UPHELD, untouched. The breadcrumb's
`controlsShown` guard is unchanged.

**Records this list missed** — none violated. The brief's list pointed at
`src/modules/ui`; the markdown and theme records above are the ones it did not
name that the change actually touches.

## Bycatch

- **Pre-existing red, not mine: `bash scripts/smoke-tabs.sh` fails with
  `FAIL no filename+✕ tab label`.** Reproduced twice: on my branch, and again
  with my changes stashed at the base commit `e95f0c22`. Same message both
  times. This is a legacy tmux-tier smoke, so the gate skips it
  (`INVAR_FULL_TMUX=1` runs it); the gate's own
  `smoke-tabs-harness.ts` is green. Worth a task: a tmux-tier smoke that
  nobody runs and that has been red for some time is a decoration.
- **Flake, gate-reported: `smoke: git-watch harness` passed only on retry.**
  The gate's own RETRY TALLY named it in my green run. Unrelated to the
  breadcrumb. One occurrence; I did not chase it.
- **Contract-layer gap: no record names the breadcrumb row's own geometry.**
  `TabBarRenderer` has three column walks — `renderWorkspace`, `renderBuffer`,
  `renderBreadcrumb` — and the record *Tab bars share paint and hit geometry*
  scopes itself to the first two. The breadcrumb row now carries a real
  geometry promise (pad cells belong to the crumb; the separator belongs to no
  segment) with no record behind it, only a smoke. Either widen that record's
  scope to the third walk or add a breadcrumb record. I did not author it: the
  scope call is a design decision.
- **Distillation possibility: the hover tone is re-rolled three times inside
  `renderBreadcrumb` and `renderBuffer`.** The count badge
  (`TabBarRenderer.ts`, the `badgeHover` branch), the editor-title actions (the
  `hovered` branch), and now the crumbs each write
  `bg(palette.cursorLine)(…)` at their own site. The shared generator behind
  them is "a hovered bar affordance takes the hover tone". Three sites, one
  rule. Naming it here; the seam call is not mine to make.
- No mispainted cells, focus jumps, stalls, or wrong glyphs were seen while
  driving. No comment drift found in the files I read: the breadcrumb row
  comment in `RootView.ts` still describes what the row does.
