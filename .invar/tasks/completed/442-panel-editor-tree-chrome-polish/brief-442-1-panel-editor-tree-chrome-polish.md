# Brief 442-1 — panel, editor, and file-tree chrome polish

Read [.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md) in full before any governed work.
Iterate by DRIVING (drive -> change -> drive); write assertions only
after each symptom is gone. `bun run drive` is the first instrument
([scripts/harness/drive.md](../../../../scripts/harness/drive.md)): `--cells ROW,C1-C2` prints per-cell
chars + bg/fg; `--hover TARGET` moves the pointer without clicking;
`--gesture openPanel` opens the bottom panel with its wait built in.
All cell evidence below is from 120x40 unless stated.

## Item 1 — vertical-splitter crossings on the splitter row

See it: `bun run drive --geometry 120x40 --gesture openPanel
--key Control+Alt+b --wait-for-status 'rightDockVisible=true'
--cells 22,33-40 --cells 22,88-100`

The bottom-panel splitter row paints bg 1710886, but the cells where
VERTICAL splitter columns cross it keep the vertical splitter's bg
1447454. Two sites, ONE generator — fix the generator, not the sites:

- col 37 (right of the sidebar splitter at 36): `'─' bg1447454`
- col 91 (the right-dock splitter column):     `'─' bg1447454`

    editor ──────────────┬────────── right dock
    splitter row:  ▓─────▓─────────
                   ↑     ↑
                 col37  col91      both must paint bg 1710886

## Item 2 — splitter line leading gap (user design)

Same row, left end. The first cell becomes a SPACE carrying the row
background; the line glyphs start one cell later:

    now:   │▓──────────────     (col 37 dark, line flush)
    want:  │ ──────────────     (col 37 = ' ' bg 1710886, line at 38)

Items 1+2 together: col 37 ends as a space in bg 1710886. The col 91
crossing (item 1) stays a line glyph, in the row bg.

## Item 3 — instances toggle right padding

See it: `bun run drive --geometry 120x40 --gesture openPanel
--cells 23,112-119`

Tabs row: `☰` at col 118, panel border `│` at 119 — flush.

    now:   + Plugin  ☰│
    want:  + Plugin  ☰ │     one space between ☰ and the border,
                             INCLUDED in the toggle's hit area

The row above already breathes (`× ` then edge). Keep the count state
(`☰ 3`) rendering correct — the space precedes the border in both
states. Note `instancesToggle` geometry in panelSeparatorGeometry must
keep matching the hit area.

## Item 4 — editor bottom-border dashes near the button trio

See it: `bun run drive --size 200 --geometry 120x40 --gesture
openPanel --cells 21,34-52`

Editor action row (wrap ↵ / go-to-line ↕ / bottom ⇊ at cols 40-48):
the border dashes at cols 38-39 paint fg 1052692 (near-black); the
corner at 37 and the run right of the buttons (49+) paint the border
tone fg 8037111.

    cols:  37  38  39  40-42 43-45 46-48  49  50
    now:   ╰   ▬   ▬   [↵]   [↕]   [⇊]    ─   ─    ▬ = fg 1052692
    want:  ╰   ─   ─   [↵]   [↕]   [⇊]    ─   ─    all fg 8037111

## Item 5 — reveal button vs the tree scrollbar

See it (short tree, correct): `bun run drive --size 50 --geometry
120x40 --cells 4,28-36` -> `␣ ⊙ ␣ │` at 32-35; hover
(`--hover 33,4`) paints 32-34 bg 1974318 symmetrically.
See it (tall tree, defect): `bun run drive --open . --geometry
120x40 --cells 4,28-36` -> col 34 becomes the scrollbar
(`bg 7896217`), eating the button's right space:

    short tree:               tall tree now:      want:
    │        ␣ ⊙ ␣ │          │      ␣ ⊙ ▐ │      │     ␣ ⊙ ␣ ▐ │

Shift the WHOLE button one cell left so button + both spaces sit
clear of the scrollbar column, in both normal and hover states, with
the hit area following. The button must not jump between short and
tall trees — pick the shifted position unconditionally.

## Item 6 — reveal centers the file in the tree viewport

Now: reveal-in-tree scrolls the minimum — the file's row barely
enters at the viewport edge (first line visible). Want:

- The revealed file lands at the vertical MIDDLE of the tree
  viewport (clamp at tree start/end where centering is impossible).
- OPENING a file (quick-open, click, any path) scrolls the tree the
  same centered way when reveal-open-file is active.

Drive it with a deep tree (`--open .`, reveal something far down via
the ⊙ button after opening a deep file with `--type` in quick-open),
and read the tree viewport position from the status projections.

## Verification

One pass at the END: extend the relevant harness smokes (panel
chrome, editor chrome, file tree) with count/position assertions for
each item — through the real gesture path, no driver internals. A
planted positive control for at least items 1 and 6 (paint the wrong
bg / assert center-off-by-N goes red). Timeless assertions only.

## Invariants in scope

- The design contract [design.invariants.md](../../../../design.invariants.md):
  hover reveals, paddings, button hit areas. Propose records for the
  settled rulings: one-cell breathing at chrome edges (items 2,3,5)
  and centered reveal (item 6) if the contract lacks them.
- Panel geometry records in [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)
  touched by the toggle hit-area change (item 3) and button shift
  (item 5): keep status projections truthful to painted cells.
- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md)
  for every new smoke arm.

## Bycatch expected

Report per the [AGENTS.md](../../../../AGENTS.md) taxonomy (runtime
defects, invariant violations, comment drift, distillation, generator
drift, nonsense). Carry a `## Bycatch` section even when it reads
`None observed`.

## End state

A report in this folder covering all six items with driven
before/after cell evidence per item. Smokes green. Do not run
`scripts/merge-gate.sh`; commit with SKIP_GATE=1; the conductor gates
at landing.

## PART 2 — top chrome: project row, breadcrumbs, history (items 7-12)

User-confirmed design, 2026-08-01. Current top rows
(`bun run drive --open . --geometry 120x40`):

    row 0   ● invar                                  ‹  ›  +
    row 1     main
    row 2   ‹  ›  invar                                    ▧
    row 3   [editor; breadcrumbs when a file is open]

Confirmed end state:

    row 0   ● invar                                        +      workspace tabs
    row 1     main                                                branch
    row 2   ␣⌕ invar                                       ▧      project row, PANEL-TONE bg
    row 3   ␣❮␣␣❯␣  src › modules › ui › Panel.ts                 breadcrumbs + history
    row 4   Panel.ts ×  Drive.ts ×                                file tabs
            ──────────────────────────────
            content

## Item 7 — history controls move to the breadcrumb row, leftmost

Remove `‹  ›` from the project row. They render at the breadcrumb
row's left edge. When no file is open the row still renders, with
just the dimmed history cluster — stable layout, nothing jumps.

## Item 8 — history buttons: fat glyphs, padded hit areas

Use the prominent angle glyphs (the terminal-prompt weight, `❮ ❯`),
not the thin `‹ ›`. EACH button owns its padding cells, and hover
paints button + padding as one block (the reveal-button pattern):

    normal:   ␣❮␣ ␣❯␣
    hover ❮:  ▒▒▒ ␣❯␣      hover bg covers the space cells too;
                            the spaces are part of the hit area

## Item 9 — project row: search icon + padding, darker background

Left side of the project name: the search glyph used everywhere else
in the app, with one space cell before it (one-cell breathing):

    now:   ‹  ›  invar
    want:  ␣⌕ invar         click on ⌕ (and its pad) opens quick-open

The WHOLE project row paints the panel tone (bg 1447454), like the
left/right/bottom chrome — the editor content stays the only light
surface.

## Item 10 — breadcrumb row moves above the file tabs

Order becomes: project row -> breadcrumb+history row -> file tabs ->
content (the Safari model: navigation chrome grouped, tab strip
adjacent to its content). Accepted design; if driving reveals a
concrete usability regression, report it with evidence instead of
silently deviating.

## Item 11 — (merged into 8: glyph prominence)

## Item 12 — history shortcuts broken on mac

`Alt+[` / `Alt+]` on macOS produces a dead/optional character; the
terminal never delivers the chord. Rebind history back/forward to
Alt+Left / Alt+Right with explicit handling of the macOS terminal
escape sequences (Option-as-Meta AND the ESC-b/ESC-f style
sequences), keep a Ctrl+Alt+[/] fallback binding, and ensure both
commands are reachable from the command palette. Verify through the
PTY by sending the exact byte sequences a mac terminal emits.

## Additional invariants in scope (part 2)

- Keybinding records in the keybindings module contracts (reserved
  chords, toggle symmetry) — check before rebinding.
- The breadcrumb behavioral contracts (hover pad, highlight bounds)
  in the breadcrumb smoke — the row move must keep them green, and
  the history cluster must not break the "one margin cell plus hover
  pad" prefix assertions; refine those assertions deliberately, with
  the new cluster accounted for.
- [design.invariants.md](../../../../design.invariants.md) gains: padded-button pattern (button owns its
  padding; hover paints the block), and the top-chrome row order.
