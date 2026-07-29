# 229 — a scale-parity selection smoke: mouse drag, copy, caret at 500k depth

State: ACTIVE
Created: 2026-07-29
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: default
Priority: verification-integrity

## Outline

#219's named boundary 3. Its at-scale verification (mouse drag selection,
Ctrl+C, click caret at maximum scroll depth in 100k and 500k files) ran as a
scratch drive and was deliberately not committed — a drive is not a ratchet.
The existing selection smokes run at fixture scale only, so native selection
at depth has no gate coverage.

Build the gated smoke from #219's recorded drive: `Control+End` first, then
drag-select at depth, assert the selection line/col values, `lastCopyChars`,
the click caret, and the native caret cell. Load-invariant counts, no clocks.
Respect pool-membership discipline (#190): earn concurrency or declare serial.
Positive control: break `caretAnchor` (the #219 control) and require the red.

Blocked-by note: NOT blocked, but coordinate with #216's landing — the drive
on-ramp fix changes how scale fixtures are created (system temp, cleaned per
run). Also add the one-line note #219 flagged to `scripts/harness/drive.md`:
a fresh directory workspace starts with editor focus, so `Enter` does not open
the selected tree row; click does.

## Sources

- `report-219-...md` — "Native selection, copy, and the caret" table and
  boundary 3; Bycatch (the Enter-focus note).
