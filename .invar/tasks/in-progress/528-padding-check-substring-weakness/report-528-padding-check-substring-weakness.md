# READY — #528 (padding check substring weakness)

## In plain words

A test checked a button's padding by searching for the word "Cancel" with
spaces around it anywhere on the screen. Spaces from neighboring words could
supply that match, so a button with wrong padding still passed. The test now
measures the button's own painted cells, one by one, inside the dialog's
published rectangle. I proved the fix by shrinking the padding on purpose:
the old search still passed, the new check failed.

## What changed

One file: `scripts/harness/smoke-search-mouse-harness.ts`
(commit b3797b22 on branch `fleet/528-padding-check-substring-weakness`).

- Removed the substring assertion `snapshot.findText(' Cancel ') !== null`.
- Added `cancelButtonPaintsPaddedSpan(snapshot, bounds, background)`: finds
  the `Cancel` label, requires it inside the dialog's published
  `overlayDialogBounds.quitConfirmation` rectangle, then asserts all 10 cells
  of the button span (2 padding cells + 6 letters + 2 padding cells) paint
  the expected character AND share the focused-button selection background
  (`ThemePalettes.Class.DARK.selection`, #2b2f41). Cancel is the safe
  focused choice in the Replace All consent dialog, so its whole span
  carries that background. Neighbor text cannot supply such cells.
- This matches the quit smoke's established form
  (`focusedButtonUsesTheme` in
  `scripts/harness/smoke-quit-confirmation-harness.ts`).
- The wait is a real condition (`awaitGridCondition` on the span predicate),
  false until the dialog paints. No sleeps, no new timeouts.

The dialog paints the button as `  Cancel  ` (two spaces each side, from
`OverlayLayer.quitConfirmationContent`, label template
`` `  ${cancelLabel}  ` ``). The new check asserts that exact painted
reality.

## The bar — both polarities

- Positive control: planted `` ` ${cancelLabel} ` `` (one-space padding) in
  `src/modules/ui/OverlayLayer.ts` (scratch, reverted). Result of the run:
  `PLANT: old substring check passes: true` (a temporary probe of the old
  `findText(' Cancel ')` assertion) followed by
  `error: Timed out waiting for grid condition: the safe Cancel action
  paints its own padded span`. New check red, old check green, exactly the
  weakness the brief names. Plant and probe removed before commit.
- Green polarity: `bun scripts/harness/smoke-search-mouse-harness.ts`
  ALL-PASS after the revert.
- Full `bun test`: 2522 pass, 0 fail (22.5s).
- Invariants checker (`--all --refs`): 1438 annotations resolved, 0 problems
  (two pre-existing coverage notes unrelated to this task).

## Bycatch

- Comment drift (wording, both in the brief and the old assertion label):
  "one-key padding" — the button actually paints TWO space cells each side
  (`OverlayLayer.ts` label templates `` `  ${label}  ` ``). If "one key" is
  read as one cell, the doctrine wording and the paint disagree. The new
  assertion label says "key-width padding" and the check states 2 cells
  explicitly. Not fixed — the doctrine wording is the conductor's call.
- Distillation possibility: the quit smoke's `focusedButtonUsesTheme`
  (`smoke-quit-confirmation-harness.ts`) and this task's
  `cancelButtonPaintsPaddedSpan` are near-copies of one generator:
  "assert a padded dialog button's exact cell span with a shared
  background". The quit smoke hardcodes per-label widths (`'Yes' ? 7 : 6`);
  a shared harness helper (label + padding + bounds) would serve both. Not
  unified — the seam call is a design decision.
- The quit smoke's `focusedButtonUsesTheme` does not constrain the found
  label to the dialog's bounds (it uses a bare `findText`); the same
  neighbor-text class of weakness is mostly, but not fully, closed there by
  the background requirement. Observation only.

## Instrument feedback

EASY: PtyTestDriver's `awaitGridCondition` + `cell()` background reads made
the span assertion direct. MISSING: nothing blocking; a shared
"padded-button span" harness helper is the ask named in bycatch.
