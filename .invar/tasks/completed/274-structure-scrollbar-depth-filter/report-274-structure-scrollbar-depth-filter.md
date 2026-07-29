# READY — #274 (structure scrollbar, per-file depth, and filter)

State: READY

Commit: `857a290ba8c8352b905240cf438f77f790af6647`

Branch: `fleet/274-structure-scrollbar-depth-filter`

The worktree is clean. The requested report directory existed. This report uses the requested path,
not the `/tmp` fallback.

## Result

The Structure pane now has all three requested arms.

- An overflowing outline uses the shared right-dock `SolidThumbScrollBar`. Wheel momentum, keyboard
  reveal, and scrollbar track clicks read and write the same `scrollTop`. The fixed filter row stays
  above the scrolling viewport.
- The default symbol depth is a contributed setting with value 1. This shows top-level symbols and
  their direct children. Ctrl+Up and Ctrl+Down set an override for the active file. Ctrl+0 removes
  the override and rejoins the setting. Overrides last for the current workspace session. They do
  not create a global path database.
- Left and Right fold and unfold the selected parent. A click on the shared fold glyph does the same.
  Fold state belongs to the file and refines its depth without changing that depth.
- Typing filters all source symbols, including symbols hidden by the current depth.
  `CommandScoring.fuzzyScore` supplies the same matcher as Quick Open. `TextInputModel` and the
  shared text-input bindings supply editing. Escape clears the query. Enter jumps through the
  existing source-text navigation contract.
- The new text field exposed an existing duplicate key classifier. The change distilled it into
  `TextInputKey`, then reused it in the app router, agent composer, and Structure pane.

## Driven evidence

Defaults came first.

- Before the change, `StructureOutline.ts` painted 102 flat rows in a 14-row viewport. It had no
  filter field and no right-dock scrollbar.
- After the change, the same code file painted 96 rows at default depth 1. Ctrl+Up changed the file
  to depth 0 and 17 rows.
- Typing `reproject` reduced the source outline to 2 fuzzy matches. Down selected the second match.
  Enter published `cursor={"line":393,"col":2}` and returned focus to the editor.
- [src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) supplied the larger Markdown outline. Depth 1 painted 3 rows.
  Depth 2 painted 65 rows. Keyboard navigation crossed the 13-row viewport and advanced
  `structureScrollTop` from 0 to 3.
- The shared scrollbar diagnostic for that Markdown drive published `scrollSize=65`,
  `viewportSize=13`, `trackLeft=25`, `laidX=118`, `laidY=5`, `laidW=1`, and `laidH=12`.
- The real plugin PTY smoke used an overflowing TypeScript outline. It proved live right-dock
  scrollbar geometry, a track click, keyboard scroll parity, a hidden-depth fuzzy match, filtered
  Enter, Escape, row folds, per-file depth isolation, reset, uninstall, and reinstall.

The shared 100,000-line scale fixture is a `.txt` file. It does not have a structure provider, so it
cannot exercise the Structure projection. The app painted all 100,000 lines correctly. The smaller
TypeScript fixture covered real analyzer depth. The 65-row Markdown table of contents covered the
larger overflowing Structure projection.

## Positive controls

Each new arm went red before its green result was trusted.

- Depth: changing the constructor default from 1 to 0 removed direct children. The outline test
  failed 5 cases, including the expected `method` row and the open-parent state.
- Filter: inverting fuzzy-match acceptance made the filter return `Widget`, `render`, and `helper`
  instead of hidden `innerTask`. The named filter test failed.
- Scrollbar: forcing the right-dock content extent to zero made the PTY smoke fail at
  `the overflowing structure outline projects a live right-dock scrollbar`.

All three defects were removed before the final gate.

## Verification

- `bun scripts/harness/smoke-plugin-manifest-harness.ts` passed the new Structure drive and all
  existing plugin lifecycle arms.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` reported 0 problems.
- `bash scripts/merge-gate.sh` passed in 3m16s.
- The gate passed type checking, formatting, invariant checks, all unit tests, 61 parallel PTY
  smokes, behavioral contracts, and 3 serial checks.
- No gate step passed only on retry.

The commit used `SKIP_GATE=1` only to prevent the pre-commit hook from running the same complete gate
a second time. The exact staged state had already passed the full gate.

## Bycatch

- Reproduced twice: `bun run drive --size 100000 --geometry 120x35` timed out after 15 seconds, and
  the same drive with `--timeout 30000` timed out after 30 seconds. Both final frames correctly
  painted the 100,000-line file. Suspect: Drive treats an installed Structure projection with
  `structureStatus="no-document"` as unsettled even when the unsupported file keeps the pane hidden.
  This is a harness quiescence defect, not a Structure runtime defect.
- Comment drift, confirmed on a second read: the first paragraph of
  `src/modules/ui/PaneContent.interface.ts` says the seam is not yet retrofitted onto the editor,
  tree, or Markdown panes. The next paragraph says the file tree and source-text editor are citizens
  today.
- Comment drift, confirmed on a second read: the ScrollbarSync comment in
  `src/modules/ui/RootView.ts` says RootView constructs the bars and names methods that do not exist.
  `ScrollbarSync` constructs the bars and owns their change handlers.

No bycatch was fixed in this task.
