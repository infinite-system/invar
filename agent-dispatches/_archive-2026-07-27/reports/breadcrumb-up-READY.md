# Breadcrumb upward step — READY

Commit: `48ae24b` (`feat(ui): add breadcrumb popup upward control`)

## Outcome

- `BoundedListPopupGeometry.navigateBackwardControl` publishes the exact
  one-cell mouse target used for paint, hover, and hit-testing.
- The control click calls `BoundedListPopup.navigateBackward()`, the same
  operation invoked by the existing `listPopup.navigateBackward` Left-key
  binding. `BreadcrumbPicker.navigateBackward()` remains the sole filesystem
  re-root generator.
- `ThemeIcons.popupNavigateBackward` resolves at nerd, unicode, and ascii
  tiers. Every glyph measures one display cell with
  `EditorCoordinates.Class.lineWidth` and avoids all task-reserved marks.
- The control is absent at the workspace root
  (`navigateBackwardControl: null`), so there is no silently dead affordance.
- Upward navigation keeps the popup open, clears the query because the filter
  belonged to the previous directory item set, and selects the directory just
  left so Right can immediately enter it again.
- Published popup title, item identifiers, and selected identifier let the
  driven smoke prove that Left and click produce identical semantic state.
- Added the chosen invariant `Popup hierarchy is mouse and keyboard
  reachable`, with enforcement annotations and the complete canonical record.

## Verification

Exact final exit codes:

- `bunx tsc --noEmit` — `0`
- `bun test` — `0` (`1374 pass`, `0 fail`, `16103 expect() calls`)
- `bun scripts/check-file-grammar.ts` — `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` — `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` — `0`
  (`717 annotation(s) resolved`, `0 problem(s)`)
- `bash scripts/conventions-gate.sh` — `0`
- `bun scripts/check-coverage-ratchet.ts` — `0`
- `bun scripts/harness/smoke-bounded-list-popup-harness.ts` run 1 — `0`
- `bun scripts/harness/smoke-bounded-list-popup-harness.ts` run 2 — `0`
- `bun scripts/harness/smoke-bounded-list-popup-harness.ts` run 3 — `0`

Coverage ratchet:

- bounded popup smoke: assertions `27 → 33`, waits `57 → 63`
- app status projection test: assertions `27 → 30`, waits `1 → 1`
- theme icons test: assertions `17 → 19`, waits `7 → 8`
- bounded popup test: assertions `26 → 29`, waits `9 → 10`
- breadcrumb picker test: assertions `9 → 13`, waits `1 → 2`
- No assertion or wait decrease; `coverage-deltas.md` was not changed.

## Cleanliness

- `git status --short` produced no output after commit.
- `git ls-files | grep '^TASK'` produced no output (expected exit `1`).
- No merge gate, push, merge, tag, branch deletion, or branch cleanup was run.
