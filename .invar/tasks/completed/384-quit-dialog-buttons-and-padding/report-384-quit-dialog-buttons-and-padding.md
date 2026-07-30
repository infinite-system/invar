# READY — quit dialog buttons and padding (#384)

Commit: `aec482664cdba50ca1875b96ec6d587c190035af`

GATE_EXIT: 0

## Outcome

The quit dialog now uses bracketless `Yes` and `No` button surfaces. Each
label keeps two cells of horizontal padding. The focused button uses the
theme selection tone. A hovered button uses the same cursor-line background
and accent foreground as panel tabs.

The dialog grew from 32×8 to 36×9 cells. The question and instruction now
keep at least two blank cells from both sides. The dialog also has one blank
interior row below the instruction.

[OverlayLayer](../../../../src/modules/ui/OverlayLayer.ts) derives button
paint and hit zones from the same padded labels. A click on a padding cell
therefore activates the button that owns the painted cell.

The census found no shared confirmation-button painter. The close-tab
confirmation uses a separate `[y/N]` prompt. No other dialog inherited this
button change. The shared dialog-width helper gained an optional horizontal
padding input, but all other callers keep the previous zero-padding default.

## Driven result

I reproduced the old dialog first at 100×30:

```text
│Are you sure you want to quit?│
│      [ Yes ]    [ No ]       │
│Left/Right or Tab, then Enter │
```

The repaired dialog at 100×30 and 80×24 is:

```text
│                                  │
│  Are you sure you want to quit?  │
│                                  │
│          Yes        No           │
│                                  │
│  Left/Right or Tab, then Enter   │
│                                  │
```

The [quit confirmation PTY contract](../../../../scripts/harness/smoke-quit-confirmation-harness.ts)
drives the same result with 10 lines under the dark Nerd Font theme and
100,000 lines under the light ASCII theme. Both scales use the same 36×9
geometry and cell layout.

## Permanent contract and positive control

The PTY contract now requires:

- exact two-cell padding across every focused button cell;
- no bracket glyph in any dialog body row;
- at least two blank cells beside the question and instruction;
- one blank bottom-padding row;
- selection colors from the active theme;
- panel-tab hover colors from the active theme; and
- mouse activation from the first padding cell of each button.

I temporarily restored the `Yes` label to `[ Yes ]`. The real PTY contract
went red with:

`FAIL scale 10: the dialog body contains no bracket decoration`

I removed the plant. The contract passed at both scales.

## Invariant verdict

PASS.

- [Appearance comes only from theme data](../../../../src/modules/theme/theme.invariants.md)
  is upheld. Focus and hover use `selection`, `cursorLine`, `accent`, `fg`,
  and `dim` palette values.
- [Overlay dialogs stay inside the terminal](../../../../src/modules/ui/ui.invariants.md)
  is upheld. The shared geometry clamps the larger 36×9 dialog, and both
  driven terminal sizes kept the complete rectangle inside the canvas.
- [Overlay keyboard actions have visible mouse paths](../../../../src/modules/ui/ui.invariants.md)
  is upheld. Keyboard focus, pointer hover, and pointer activation remain
  visible and functional.
- The paint-equals-hit rule in the
  [UI contract](../../../../src/modules/ui/ui.invariants.md) is upheld. The
  padded label widths generate the button hit ranges.

## Verification

- Default drive at 100×30 before and after the change — PASS.
- Compact drive at 80×24 after the change — PASS.
- Scale drive with 10 and 100,000 lines — PASS.
- Bracket positive control — RED as expected.
- `bunx tsc --noEmit` — PASS.
- Full pre-commit merge gate — ALL-PASS, `GATE_EXIT=0`.
- The successful gate reported no retry-assisted pass.
- Worktree after commit — clean.

## Bycatch

- On the first 80×24 default drive, after `Control+Q`, frame 3 showed the
  dialog top border while underlying pane rows overpainted most interior
  content. The same 80×24 drive after the change showed the complete dialog.
  This did not reproduce a second time. I made no separate fix.
- The first pre-commit gate passed its first four input-byte sessions, then
  session 5 showed the edited glyph in complete frame 2 instead of frame 1.
  The second full gate passed all five sessions. This did not reproduce. I
  did not change the input path or its check.
