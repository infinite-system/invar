# READY — #268: MAIN IS RED — fix the editor smoke under #237's auto-open default

Branch: `fleet/268-editor-smoke-vs-auto-open-red-main`
Commit: `3bf9f861` — "#268: the editor smoke measures the editor pane; fixed columns broke under #237's auto-open"
Tree: clean. Only `scripts/harness/smoke-editor-harness.ts` changed, plus my probe in the task folder.

## Summary

The smoke assumed a full-width editor in three places, not one. All three now
measure the editor pane at assert time (fix shape 1 from the brief). The
wrap-off property keeps its exact label and its citation. #237's auto-open
default is untouched — no setting, no source change. The full smoke is green
under the real defaults, and the pre-commit merge-gate ran GREEN end to end.

## The red, reproduced on unmodified main

My worktree branched from main tip `06d2709e` (contains #237's `d42f2af0`).
`bun scripts/harness/smoke-editor-harness.ts` on the unmodified tree, exit 1,
deterministic:

```
error: FAIL wrap-off keeps consecutive logical lines on consecutive terminal rows
      at requireCondition (.../scripts/harness/HarnessSmokeSupport.ts:19:29)
      at .../scripts/harness/smoke-editor-harness.ts:123:3
```

## Mechanism, seen by driving

My probe (`.invar/tasks/in-progress/268-editor-smoke-vs-auto-open-red-main/probe-268-wrap-off-grid.ts`,
committed) repeats the smoke's walk and prints the grid with column rulers.
The tree-walk opens [fixtures/README.md](../../../../fixtures/README.md). The preview auto-opens LEFT of the
source, per the record in [src/modules/markdown/markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md). The
editor pane now spans columns ~79–119; the preview spans ~38–78. The typed X
sits at row 7, column 85; the gutter digits sit at columns ~82–83. The
smoke's `gutterNumber()` read the fixed window `slice(37, 44)` — now inside
the preview pane, no digits, `null`, FAIL.

## The fix — measure, do not assume

Three stale full-width assumptions in `scripts/harness/smoke-editor-harness.ts`:

1. **The gutter window.** `gutterNumber()` now takes a column known to sit
   inside the editor pane (the typed glyph's column), scans left to the
   pane's `│` border with `lastIndexOf`, and reads the first digit run in
   the 7 cells after the border. No fixed columns.
2. **The Option-wheel column.** The SGR wheel events were hard-coded to
   column 44 — now the preview pane, so `editorScrollLeft` never moved and
   the wait timed out (the second red, quoted below). The wheel now aims at
   the measured `fixturePosition.column + 1`.
3. **Preview-satisfiable waits.** The preview paints the SAME fixture text
   as the source. Two waits were satisfiable before the editor did any work
   (the classic convention-7 predicate): the End-step wait for `desync)`
   (the preview shows "(regression: gutter desync)" at all times) and the
   post-End `findText('Fixture')` wait (the preview always shows "Fixture",
   so `fixturePosition` could capture the preview's copy while the editor
   was still scrolled). Both waits now search only the long line's own row,
   right of the measured editor-pane border.

The intermediate red that exposed number 2, after number 1 was fixed:

```
error: Timed out waiting for Option-wheel advances the horizontal scroll offset at /tmp/tui-editor-harness-home-0Ybnfu/status.json
```

## Verification

**Green.** Full `bun scripts/harness/smoke-editor-harness.ts`, twice
(once after the fix, once after the positive-control plant was removed):

```
smoke-editor-harness: ALL-PASS
EXIT: 0
```

**Positive control.** I planted the recorded defect — soft wrap in wrap-off
mode — in `EditorWrap.segmentsForLine` (wrap-off branch returned
`this.wrapLine(lineText, 30)`). The measured assertion caught it, exit 1:

```
error: FAIL wrap-off keeps consecutive logical lines on consecutive terminal rows
      at .../scripts/harness/smoke-editor-harness.ts:139:3
```

The plant is removed; `git diff --stat src/` is empty on the commit.

**Contracts and types.** `tsc --noEmit` clean.
`node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
`1051 annotation(s) resolved, 217 lattice link(s) resolved, 0 problem(s)`.

**The whole gate.** The pre-commit hook ran the full merge-gate: GREEN, all
61 parallel smokes OK — including git-watch, panel-chrome, and agent-cancel
(the known flake classes; my diff does not touch them).

**Records honored.** The wrap-off record ("One visible file line is one
visual row when word wrap is off", [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)) keeps
its smoke check with the same label. The auto-open record ("The Markdown
preview opens itself and sits on the configured side",
[src/modules/markdown/markdown.invariants.md](../../../../src/modules/markdown/markdown.invariants.md)) is untouched; the smoke now
holds WITH the preview open, which is the point.

## Bycatch

- **Legacy tmux editor smoke has the same stale window** —
  `scripts/smoke-editor.sh:83` reads the identical fixed
  `slice(37,44)` gutter window. Suspect red under the auto-open default if
  anyone runs the `INVAR_FULL_TMUX=1` tier (the gate skips it). Not run,
  not fixed here. Note: the wrap-off record's Evidence and Verification
  lines in [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) cite this legacy check, so
  the record points at a stale instrument once that red is confirmed.
- **Other smokes hard-code editor-area columns** (they hold today because
  their fixtures are not markdown, so no preview opens; named, not fixed):
  `scripts/harness/smoke-wrap-harness.ts:357,363` clicks the editor at
  fixed column 60; `scripts/harness/smoke-horizontal-extent-harness.ts:112,156`
  wheels at fixed column 70, row 15;
  `scripts/harness/smoke-search-mouse-harness.ts:146,166,172` moves the
  mouse at fixed columns 31–32.
- **Suspect — preview one frame behind the source.** In my probe's settled
  frame the editor showed the typed X ("AX tiny project…") while the
  auto-opened preview still painted the pre-edit paragraph ("A tiny
  project…"). Seen once; likely the next-frame reparse. The markdown split
  record lists "editing source while the visible preview remains on an
  older revision" under Impossible-if-true, so the wording and the observed
  frame at least deserve a look.
- **Latent row-order dependency inside the fixed smoke.** The remaining
  whole-grid `findText` waits in `smoke-editor-harness.ts` ('tiny project',
  'X', 'src', 'greeter.ts') stay correct only because the editor's copy of
  the text paints at a LOWER row number than the preview's copy. That
  ordering is layout luck, not a measurement. If a future default stacks
  the panes differently, these waits mis-target silently.
