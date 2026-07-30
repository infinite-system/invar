# READY #345 — horizontal panel separator glyph sits vertically centered

Commit: `34a964196c1265fb1568ea7d338bec3d19de15dd`
GATE_EXIT=0 (pre-commit hook, `merge-gate GREEN — commit allowed`)
Branch: `fleet/345-horizontal-separator-centered-glyph`. Worktree clean. Not pushed.

## What changed

Pane splitters now paint the heavy horizontal line `━` (U+2501), which sits in the
vertical middle of its row. They used to paint the lower-half block `▄` (U+2584).

The painter `SeparatorAppearance` is SHARED with `SolidThumbScrollBar`. A plain
glyph swap would have changed every horizontal scrollbar in the app. See
"The brief's premise needed a correction" below. So the horizontal glyph is now
a mark the caller names:

- `centeredLine` (`━`) — `SplitterElement` asks for this.
- `bottomAnchoredHalfBlock` (`▄`) — `SolidThumbScrollBar` asks for this. Unchanged.

Files: [SeparatorAppearance.ts](../../../../src/modules/ui/SeparatorAppearance.ts),
[SplitterElement.ts](../../../../src/modules/ui/SplitterElement.ts),
[SolidThumbScrollBar.ts](../../../../src/modules/ui/SolidThumbScrollBar.ts),
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md), plus the three tests and
[smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts).

## Drove it first — the symptom

`bun run drive --geometry 100x30 --key Control+j`, row 16 of the settled grid:

```
15 │    │                              │ ╰────────────────────────────────────────────╯│
16 │    │                              │ ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  +  ↗  × │
17 │    │                              │ ╭────────────────────────────────────────────╮│
```

The same drive after the change:

```
16 │    │                              │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  +  ↗  × │
```

## Both candidates driven and measured

The grid names WHICH glyph is in a cell. It does not say where the ink sits
INSIDE the cell, and that is the whole question. So I measured it.

Tool: [measure-345-separator-glyph-ink.py](measure-345-separator-glyph-ink.py). Its
header explains how to run it and how to read every number. It rasterizes one cell of
DejaVu Sans Mono, the system monospace font, and reports the ink band. The link is
dead until the branch lands. The script is committed in the worktree copy of this
folder and arrives here with the merge.

| glyph | thicknessRatio | centerOffsetRatio |
|---|---|---|
| `▄` U+2584 lower half block (old) | 0.500 | **+0.250** |
| `━` U+2501 heavy horizontal | 0.132 | **+0.000** |
| `─` U+2500 light horizontal | 0.079 | **+0.000** |
| `█` U+2588 full block (vertical bar reference) | 1.000 | +0.000 |
| `-` U+002D hyphen (ascii stand-in) | 0.066 | +0.059 |

`centerOffsetRatio` is (ink midpoint minus cell midpoint) divided by cell height.
0.000 means the mark sits in the vertical middle of the row.

The old `▄` sat a QUARTER OF A CELL below the middle. That is the defect the user
reported, now a number.

**Chosen: `━` U+2501 heavy.** Reasons:

1. Both candidates centre exactly, so centring does not decide it.
2. Heavy carries 1.7x the ink of light (0.132 against 0.079). The separator paints
   in `palette.border`, which is a low-contrast colour by design. Light risks
   reading as absent on a dim border.
3. The user said the thinner separator "is better", but did not ask for thinner
   still. Heavy is the smaller step away from what they already approved.
4. `─` is the same glyph the pane boxes draw their own borders with. A splitter
   that looks exactly like a static box border loses its "you can drag me" signal.

## The brief's premise needed a correction

The task file and the brief both said "swap the glyph in `SeparatorAppearance.paint`".
Neither noticed that `SolidThumbScrollBar` calls the same painter. Doing what the
brief literally said would have changed the track and thumb of EVERY horizontal
scrollbar in the app: editor, tree, git changes, git log, terminal scrollback,
markdown preview, agent transcript, hover card, and both diff bars.

That would have been wrong, and not only because it was out of scope:

- A scrollbar thumb is a DRAG TARGET. Its half-cell weight (0.500) is what makes it
  read as a graspable bar. `━` would have cut it to 0.132.
- The recorded reason for `▄` on a scrollbar is edge anchoring, not centring: "The
  lower half anchors the bar to the pane's trailing edge; the upper half stays open."
  A scrollbar reports a position ALONG an edge. Centring it contradicts its job.

A splitter has the opposite job. It divides two regions, so its mark belongs in the
middle. The two roles genuinely differ, so the glyph became the caller's named
choice while the painter, the one-cell cross-axis count, and the whole-cell hit
target all stay shared. This is peripheral config on a shared seam, not a consumer
suppressing the seam's core.

If the user WANTS horizontal scrollbars centred too, it is a one-word change at the
two call sites in `SolidThumbScrollBar.ts`. I did not make that call for them.

## Invariants answered, record by record

### "One scrollbar painter gives each axis equal visual weight" — REFINES (in scope, listed)

Its core claim is about SCROLLBARS, and scrollbars did not change, so it is not
violated and not stressed. But two clauses had rotted the moment the painter grew a
second mark. Both are re-worded in the same commit:

- **Scope** said `SeparatorAppearance` "shared with `SplitterElement`, owns the
  axis-specific cell treatment". It now records that the splitter asks the same
  painter for a DIFFERENT horizontal mark, and why.
- **Mechanism** said the painter "uses ... `▄` with transparent background for
  horizontal rectangles", full stop. It now names the mark
  (`bottomAnchoredHalfBlock`) that produces `▄`.

The **Invariant**, **Impossible if true**, **Generates**, and **Evidence** clauses
all stand unchanged and still hold. Its "Impossible if true" list forbids `█` and
`▀` in a horizontal bar. `━` never reaches a scrollbar, so that list needs nothing.

### "Splitter paint and hit testing share one geometry" — REFINES (the brief MISSED this one)

The brief listed only the scrollbar record. This record also cited the old glyph and
also needed the change. Its **Invariant** clause literally said "A horizontal
boundary paints only the lower half of that hit cell". That sentence became FALSE
the moment the splitter painted `━`. It now states the centred heavy line, and says
why the splitter mark and the scrollbar mark differ.

Its load-bearing claim is untouched. The cell that paints is still the cell that
receives the pointer. `SplitterElement` still sizes the renderable through
`CROSS_AXIS_CELL_COUNT`, and OpenTUI still stamps that same rectangle into the hit
grid. The glyph never entered hit testing. Its **Impossible if true** list gained one
entry: a horizontal splitter cell holding the scrollbar's `▄`. Its **Evidence**
clause now names the panel-chrome smoke assertion that proves it.

Both records got `**Last refined:** 2026-07-30`.

### Records this list missed

The brief named one record. The splitter-geometry record above is the second, and it
was the one whose statement the change actually falsified. Beyond those two I found
no further record citing the glyph. I checked
[ui.lattice.md](../../../../src/modules/ui/ui.lattice.md) and
[project.lattice.md](../../../../project.lattice.md) for stale citations of the
lower-half block and found none.

## Verification

| check | result |
|---|---|
| `bun test src/modules/ui` (58 files) | 244 pass, 0 fail |
| `bun scripts/harness/smoke-panel-chrome-harness.ts` | ALL-PASS, both widths, scales 10 and 100000 |
| `bun scripts/harness/smoke-scrollbars-harness.ts` | ALL-PASS, scrollbars unaffected |
| `check_invariants.mjs --all --refs` | 1219 annotations, 223 lattice links, 0 problems |
| pre-commit merge gate | GATE_EXIT=0 |

**Scale parity.** The panel-chrome smoke drives the splitter at 10 lines and at
100,000 lines, at 100, 55, and 47 columns. Every one asserts the drag span paints
`━` across its whole width. Drag still moves the splitter at all of them
("the drag segment remains nonzero after movement").

**Positive control.** I planted the defect the new assertion claims to catch: made
`SplitterElement` ask for `bottomAnchoredHalfBlock`, ran
`bun test src/modules/ui/SplitterElement.test.ts`, and it went RED:

```
Expected: "━━━━━━━━━━━━━━━━━━━━"
Received: "▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄"
(fail) SplitterElement > horizontal splitters paint the vertically centered separator mark
```

Then I removed the plant. The measuring script has a positive control built in: it
reports `+0.250` for the glyph that is NOT centred, so it can say "not centred".

**Hit testing untouched.** The paint path and the hit path share one rectangle, and
I changed neither. The smoke drives a real splitter drag at every scale and it
passes.

## Bycatch

**1. Contract-layer gap — no ASCII glyph tier reaches this painter. NOT FIXED.**
The task file asked me to check the ASCII tier. There is none, and there never was.
`SeparatorAppearance.paint` takes a buffer and a colour. It has no `Theme` access, so
`settings.glyphMode='ascii'` cannot reach it. `▄`, `━`, and `─` are all non-ASCII, so
my change neither creates nor worsens the gap. Two things follow, and both are worth a
task:
  - An ASCII-tier user sees the same box-drawing glyph either way. Every OTHER glyph in
    the app tiers through `theme.glyphLevel`. This painter is an exception nobody
    declared.
  - The panel-chrome smoke has a section headed "repeat every heading interaction at
    the ascii tier" and it PASSES. It only checks heading controls, never the separator
    glyph. The ascii-tier claim has a hole exactly where this painter sits.
  A fix means plumbing `glyphLevel` into a `Static` painter shared by two consumers.
  That is a seam change, not a small-and-obvious fix, so I left it.

**2. A one-cell hole in the bottom border of the editor and structure boxes. NOT FIXED.**
Reproduce: `bun run drive --geometry 100x30 --open src/modules/ui/SolidThumbScrollBar.ts --key Control+j`.
Row 15 of the settled grid:

```
15 │    │                              │ ╰─────────────────────────────── ╯ ╰───────────────────────── ╯│
```

Both boxes have a BLANK cell between the last `─` and the closing `╯`. Reproduced 3
times. It is PRE-EXISTING, not mine: I re-ran the same drive with `SplitterElement`
put back on `bottomAnchoredHalfBlock` and the gap is identical, so my change does not
cause it. Suspect it relates to the two-axis corner reservation, since it appears at
the bottom-right of boxes that carry both scrollbars. Labelled a hypothesis, not a
diagnosis. I did not chase it.

**3. Comment drift — FIXED, inside this commit, not a separate one.**
[SolidThumbScrollBar.ts](../../../../src/modules/ui/SolidThumbScrollBar.ts) line 3 explained
`▄` as the glyph that makes "both axes read at the same visual weight", with no hint
that another consumer exists. That sentence was already thin before my change and
would have been a trap after it. I added two lines naming both marks and both callers.
It rides in the task commit rather than its own because the drift is IN the lines the
task changed, and splitting it would leave the file self-contradictory between commits.

**4. Naming note, not a defect.** The class is called `SeparatorAppearance` but it also
paints scrollbar tracks and thumbs, which are not separators. The name lies about half
its consumers. Renaming it touches two consumers and two records, so it is a task, not
a fix.

**5. The task-link linter is blind to the exact link form every task record uses. NOT FIXED.**
`bun scripts/tasks/lint-task-links.ts` on this report exits 0. That green is not
worth much. I gave it a positive control and found it catches only ONE of two
classes:

  - A dead SIBLING link (`[bogus](report-345-missing.md)`) exits 1 and names the
    line. Correct.
  - A dead REPO link that climbs out of the task folder
    (`[bogus](../../../../src/modules/ui/NoSuchFile.ts)`) exits 0 and prints
    nothing. Reproduced 3 times, twice inside this very report.

  The `../../../../` form is what AGENTS.md's own "relative to the file that contains
  it" rule produces for every repo file cited from a task folder. It is the majority of
  links in every brief and report we write. So the pre-READY lint step named in
  AGENTS.md validates almost nothing in practice. The script's own header says "Dead
  relative Markdown links stay errors", with no carve-out, and its `--self-test` claims
  "a dead src link is not rescued by task-state fallback" and passes. So either the
  check has a hole or the header and the self-test overstate it. I could not tell which
  without reading the resolver, and I stopped there. Either way it is an instrument
  that reports green on a defect it claims to catch.

  Consequence for THIS report: I resolved all 8 relative links by hand instead. 7 exist
  now. The 8th is the measuring-script link noted above, dead until the branch lands.

No flaky-class smoke fired. #214 (panel-chrome), #359 (panel-split), and #362 (markdown
preview clipping) all passed in this gate run.
