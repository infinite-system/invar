# TASK — Code folding: one generator owns document-line-to-visual-row (#97)

You are a builder on the Invar terminal IDE. Work ONLY in `/tmp/conductor-folding`
(branch `feat-code-folding`, forked from main at `8c1dd7e`). Do NOT run `scripts/merge-gate.sh`;
do NOT push/merge/tag/delete — the conductor lands it. Commit and report to
`/tmp/code-folding-READY.md`. Run `bun install --frozen-lockfile` first.

## What the user asked for, verbatim

> "Add code folding markers to the left gutter near number lines like +/-"

## The reduction (hold it; it is why this task was sequenced late)

Folding and word-wrap are the SAME problem: both remap document lines to visual rows. Wrap expands
one document line into several visual rows; folding collapses several document lines into one. Today
wrap owns that mapping. If folding builds a second mapping, every consumer (caret movement, scrolling,
scrollbars, overview ruler, gutter, selection, mouse hit-testing) must consult two authorities and
they WILL disagree. So: **one generator owns document-line-to-visual-row; wrap and folding both
contribute to it.** Find where wrap's mapping lives (start from `EditorWrap` / `EditorCoordinates` /
the break-opportunity generator from #72) and extend that seam rather than building beside it.

## Scope

1. **Fold regions from structure, not regex-guessing**: brace/bracket blocks and indentation runs.
   The syntax module already tokenizes for highlighting — check what it can answer before inventing
   a parser. Markdown sections can wait; TypeScript/JSON blocks are the core.
2. **Gutter markers**: a one-cell fold control in the gutter adjacent to the line numbers — visually
   like VS Code's chevron but ONE CELL, from the theme vocabulary (add `foldOpen`/`foldClosed` slots
   to ThemeIcons with unicode + ascii tiers; single-column marks proven by the width-agreement
   check; do not collide with the reserved-mark table `▎ ● ❯ • ↗ ↙ + × ◉` or the activity row
   `≡ ⑂ ⌕ ⚙ ⧫`). The gutter is the DIFF column per the marks vocabulary — read
   `workspace.invariants.md` on gutter ownership and put fold controls where the contract allows
   (likely the number-gutter edge, not the diff column).
3. **Interactions**: click the marker to toggle; a folded region renders as its first line plus a
   fold indicator; caret movement and selection SKIP folded rows (moving down from the line above a
   fold lands after it); editing a line inside a folded region (paste/goto) auto-unfolds it; folds
   survive switching files and workspaces (per-document state, dropped when the document closes).
4. **Keyboard**: chords through the keybinding table, editor context, no F-keys, no collisions with
   the reserved set or the plugin layers. VS Code parity would be Ctrl+Shift+[ / ] — verify those
   ARRIVE through both parsers before choosing them (the deliverability lesson from the F-key work:
   never assume a chord encodes; drive it).
5. **What NOT to break**: wrap behavior (code-aware break opportunities, #72), scroll monotonicity,
   the overview ruler mapping, `idle-quiescence` (fold state changes repaint once, rest is rest),
   scrollbar thumb stability, and the flyweight discipline — fold-range computation must not run
   per-frame; it recomputes on document change, not on paint.

## Verification — exact exit codes

- Full checker suite (tsc, bun test, file-grammar, invariants --all/--refs, conventions-gate,
  coverage-ratchet, behavioral-contracts).
- **A new driven smoke** (`smoke-code-folding-harness.ts`): open a real TS file, fold a block from
  the gutter marker by MOUSE, verify the grid shows the collapsed form; unfold; fold by keyboard;
  caret skip-over; auto-unfold on navigation into the region; fold state surviving a file switch.
  Register it in the gate's parallel pool (it is not timing-sensitive) — a smoke the gate never runs
  cannot report that it has rotted.
- Three runs each on everything you touch; one loaded run.
- Re-run `measure-scroll-smoothness` (see project.tools.md) and report before/after — the mapping
  seam is on the scroll hot path, and a regression there is a FAIL for this task.
- Declare coverage movement (counted grammar, APPEND). Record the invariant: *One generator owns
  document-line-to-visual-row* with wrap and folding as contributors, Impossible-if-true including
  "two disagreeing mappings consulted by different consumers".

## Rules

Full descriptive names, 80 columns, ivue conventions, `X.interface.ts`, no `Class.prototype` reads.
Tab indents in the editor; host focus chord is Ctrl+Shift+J. Plugin boundary: folding is EDITOR
capability (host), not a plugin — but its marks come from the theme vocabulary like everything else.
Commit with `SKIP_GATE=1 git -c commit.gpgsign=false commit -F <message-file>`; clean tree; no TASK
files tracked.
