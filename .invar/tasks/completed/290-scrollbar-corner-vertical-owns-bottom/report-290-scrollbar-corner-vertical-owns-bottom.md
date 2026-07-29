# READY — the corner belongs to the vertical bar

Task: [the corner belongs to the vertical bar](task-290-scrollbar-corner-vertical-owns-bottom.md)

Commit: `75f1e4c99217c3f5a2307378acea54c18052b76d`

## Result

The vertical scrollbar now uses the full pane height. The horizontal track ends one column before
the vertical track. The corner cell therefore belongs to the vertical bar.

`ScrollbarSync` now gives every bar the theme `panel` and `dim` pair. Horizontal and vertical bars
have equal colours instead of accent-blue horizontal thumbs.

The shared geometry also feeds the new vertical track length into thumb inflation and drag scaling.
The editor and Markdown preview drag paths stayed continuous at 500 and 100,000 lines.

## Changed

- [ScrollbarGeometry.ts](../../../../src/modules/ui/ScrollbarGeometry.ts) gives the full region
  height to vertical tracks and `region.width - 1` cells to horizontal tracks.
- [ScrollbarSync.ts](../../../../src/modules/ui/ScrollbarSync.ts) supplies one `panel` and `dim`
  colour pair to both axes.
- [ScrollbarGeometry.test.ts](../../../../src/modules/ui/ScrollbarGeometry.test.ts) locks the exact
  track lengths and horizontal endpoint.
- [SolidThumbScrollBar.test.ts](../../../../src/modules/ui/SolidThumbScrollBar.test.ts) checks both
  axes with the dark and light palette pairs.
- [smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts) checks the
  corner owner, horizontal endpoint, colour parity, live theme switch, and continuous drag at both
  scales.
- [smoke-settings-applied-harness.ts](../../../../scripts/harness/smoke-settings-applied-harness.ts)
  and [smoke-terminal-harness.ts](../../../../scripts/harness/smoke-terminal-harness.ts) now detect
  the theme `dim` thumb colour directly.
- [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md#a-scrollbar-track-is-derived-per-frame-from-its-region-rect)
  records vertical corner ownership, the new track lengths, and colour parity.

## Driven evidence

The real PTY smoke drove dark mode and then switched the live setting to light. It repeated the
same path at 500 and 100,000 lines.

- 500-line editor horizontal drag: `0→23→47→70`.
- 500-line editor vertical drag: `0→47→94→141`.
- 100,000-line editor horizontal drag: `0→25→50→75`.
- 100,000-line editor vertical drag: `0→9997→19994→29991`.
- 500-line preview drags: horizontal `0→42→84→127`, vertical `0→48→95→143`.
- 100,000-line preview drags: horizontal `0→42→84→127`, vertical
  `0→9998→19996→29993`.

At both scales and after both theme states, the smoke confirmed these facts:

- The corner cell contained vertical background paint.
- The horizontal track ended at `vertical column - 1`.
- Both axes exposed the same two colours.

## Positive controls

I restored the old shortened vertical geometry. The real PTY smoke exited 1 with:

`FAIL 500-line dark theme corner cell paints vertical-bar content`

I restored the old accent-blue horizontal thumb. The smoke exited 1 with:

`FAIL 500-line dark theme horizontal and vertical bars use the same track and thumb colours`

I also changed the two updated colour oracles to expect the accent colour. The settings smoke
reported `scrollbarThickness paints 1 then 3 real columns (0/0)`. The terminal smoke timed out
while waiting for a two-row thumb. Both returned green after restoration.

## Verification

- `bunx tsc --noEmit`: PASS.
- `bun test`: PASS, 1,932 tests and 68,667 expectations.
- `bun scripts/harness/smoke-scrollbars-harness.ts`: ALL-PASS.
- `bun scripts/harness/smoke-editor-harness.ts`: ALL-PASS.
- `bun scripts/harness/smoke-settings-applied-harness.ts`: ALL-PASS.
- `bun scripts/harness/smoke-terminal-harness.ts`: ALL-PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: PASS,
  1,134 annotations, 222 lattice links, 0 problems.
- `bash scripts/conventions-gate.sh`: PASS.
- The commit hook passed every task-related merge-gate step. It also passed
  `behavioral-contracts`, including the changed thumb mapping.

The full commit hook remained red only because the unrelated panel-split smoke timed out after its
retry. The failure logs are in
[/tmp/merge-gate-failures.668314](/tmp/merge-gate-failures.668314). I used the documented
`SKIP_GATE=1` commit override after that complete run.

## Theme-switch coordination

The live light switch reproduced
[#284 (scrollbar colours captured at construction)](../../active/284-scrollbar-theme-captured-at-construction/task-284-scrollbar-theme-captured-at-construction.md)
at both scales. The exact smoke observation was:

`OBSERVED #284 (scrollbar colours captured at construction): colours stayed 16161e/787c99 after the live light switch`

Axis parity held after the switch, but both axes kept the dark pair. This task did not change
the live-theme seam owned by that task.

## Bycatch

- REPRODUCED TWICE: [#284 (scrollbar colours captured at construction)](../../active/284-scrollbar-theme-captured-at-construction/task-284-scrollbar-theme-captured-at-construction.md).
  A live dark-to-light switch kept `16161e/787c99` at both 500 and 100,000 lines.
- REPRODUCED: `smoke: panel-split harness` timed out after both attempts in the full commit gate.
  It waited for `panelContentOrder` and `panelCellIds` to become `agent,terminal`. The same timeout
  also appeared in the first commit-hook run.
- OBSERVED ONCE: the legacy [smoke-editor.sh](../../../../scripts/smoke-editor.sh) reported several
  stale interaction failures. The current [editor PTY harness](../../../../scripts/harness/smoke-editor-harness.ts)
  passed every equivalent editor path. The normal gate skips the legacy shell smoke unless
  `INVAR_FULL_TMUX=1`.
