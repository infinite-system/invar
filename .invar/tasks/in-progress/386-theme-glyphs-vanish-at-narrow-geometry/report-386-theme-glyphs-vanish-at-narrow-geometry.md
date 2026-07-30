# READY — #386 theme glyphs at narrow geometry

Commit: `940a46082ce37811136aa61d3677e19c23773496`

GATE_EXIT: `0`

State: READY

## Outcome

Theme glyphs now stay visible after terminal capability negotiation. The
dashboard proof reads every task action cell at 150 by 40 and 120 by 36. It
also repeats the 120 by 36 proof with 500 tasks.

There is no geometry threshold. The reported width split was a launch timing
effect in the terminal oracle. OpenTUI changed its output dialect after
capability negotiation. The slower 500-task launch reached that state before
the dashboard opened. The faster 150 by 40 launch first painted in the older
dialect.

The implementation is in
[TerminalEmulator.ts](../../../../src/modules/terminal/TerminalEmulator.ts),
[TerminalEmulatorConformance.test.ts](../../../../src/modules/terminal/TerminalEmulatorConformance.test.ts),
and the extended
[tasks dashboard smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts).

## Threshold and gate diagnosis

Width probes at 120, 135, 142, 149, and 150 columns did not produce a width
boundary. A fresh 120 by 36 drive painted the task action glyphs. A later app
at 150 by 40 could lose them. This disproved geometry as the controlling
input.

The controlling event was OpenTUI's explicit-width capability negotiation.
Before that event, its PTY stream contained ordinary Unicode text. After the
event, it encoded each one-cell glyph as:

```text
OSC 66 ; w=1 ; <glyph> ST
```

The raw PTY stream at 120 by 36 contained `❯`, `▰`, `▤`, `◫`, `✓`, and `▷`.
Layout and theme resolution were therefore correct. The shared
`@xterm/headless` oracle ignored OSC 66 and discarded each payload. ASCII
layout text remained visible, which made the loss look like a theme or width
gate.

`TerminalEmulator` now buffers partial OSC 66 runs across byte chunks,
preserves their text payloads, and sends those bytes to the same xterm parser.
It does not add a second screen model.

## Driven proof

The extended
[tasks dashboard smoke](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts)
checks the exact Unicode task action cells. Each cell must contain its theme
glyph and must have different foreground and background colors.

The final drive passed these arms:

- 150 by 40 with the small task fixture.
- 120 by 36 with the same small task fixture.
- 120 by 36 with 500 tasks and 1,001 projected rows.
- The existing ASCII attach fallback.

The terminal conformance corpus now has 235 cases. Its OSC 66 fixture checks
both ST and BEL termination. The chunk-split arm divides the sequence at
every byte boundary. The glyph payload and cursor position remain correct at
each split.

## Positive control

I replanted the defect by bypassing the OSC 66 decoder in
[TerminalEmulator.ts](../../../../src/modules/terminal/TerminalEmulator.ts).
The dashboard smoke went red with exit `1`:

```text
error: Timed out waiting for grid condition:
the 120 by 36 dashboard paints every Unicode task action glyph
```

I removed the plant. The unchanged final smoke passed all dashboard arms.

## Contract refinements

The
[theme contract](../../../../src/modules/theme/theme.invariants.md)
now includes `TaskActionIconSet`, `taskActionIcons`, and
`taskActionIconsFor` in the appearance and glyph-ladder records. The
glyph-ladder invariant now states that terminal geometry cannot change or
blank an allocated icon cell. Its evidence names both dashboard geometries,
the 500-task scale drive, and the OSC 66 byte fixtures.

The
[terminal contract](../../../../src/modules/terminal/terminal.invariants.md)
now records OSC 66 payload preservation in the emulator dialect. It removes
OSC 66 from the list of ignored protocols and names the split-boundary
evidence.

## Verification

The focused final pass was green:

- `bunx tsc --noEmit`: exit `0`.
- 262 focused tests: 262 passed, 2,196 expectations, 0 failed.
- Tasks dashboard PTY smoke: all arms passed.
- Activity-bar PTY smoke: `ALL-PASS`.
- Invariant structure check: all records passed.
- Invariant reference check: 1,234 annotations and 231 lattice links
  resolved, with 0 problems.
- Conventions gate: passed.

The first hook run found an enforced file-grammar error in the first decoder
shape. I moved the adapter into the existing emulator seam and reran the
focused checks. That issue did not recur.

Later unchanged hook runs saw these filed intermittent classes:

- [#362 markdown ordinal drive and preview clipping](../../active/362-markdown-harness-ordinal-drive-and-preview-clipping/task-362-markdown-harness-ordinal-drive-and-preview-clipping.md).
- [#364 plugin-manifest residual wait weaknesses](../../active/364-plugin-manifest-residual-wait-weaknesses/task-364-plugin-manifest-residual-wait-weaknesses.md).
- [#359 panel split Agent and Terminal order intermittent](../../active/359-panel-split-agent-terminal-order-intermittent/task-359-panel-split-agent-terminal-order-intermittent.md).
- [#385 tasks dashboard status and grid race](../../active/385-tasks-dashboard-smoke-status-grid-race/task-385-tasks-dashboard-smoke-status-grid-race.md).
- [#214 panel chrome Agent-close intermittent](../../active/214-panel-chrome-agent-close-intermittent/task-214-panel-chrome-agent-close-intermittent.md)
  appeared as retry-only in an earlier blocked run.

The final unchanged commit hook passed every step. All 65 parallel PTY
smokes passed directly. The serial behavioral contracts passed. The retry
tally was empty. The hook reported `merge-gate: ALL-PASS` and `GATE_EXIT=0`.

The worktree is clean.

## Invariant audit

The change reviewed every theme record in
[theme.invariants.md](../../../../src/modules/theme/theme.invariants.md):

- **Appearance comes only from theme data:** strengthened. The record now
  names the task action icon set and its `Theme` getter.
- **The glyph ladder degrades icons single-cell and legible:** strengthened.
  The record now covers task actions, geometry independence, OSC 66 payload
  preservation, both dashboard geometries, and scale parity.
- **Terminal capability can only be inferred from the environment:** upheld
  and unchanged. The defect was in emulator projection after OpenTUI's own
  protocol negotiation. It did not add a theme capability source.
- **Graphics tier prefers the reported capability and degrades to cells:**
  unimplicated. The change does not alter image graphics selection.
- **One table resolves every symbol mark:** unimplicated. Task actions are
  controls, not classified file or code marks.
- **The palette ladder quantizes color without leaving the palette:**
  unimplicated. Palette values and quantization did not change.

The change reviewed the implicated dashboard records in
[tasks-dashboard.invariants.md](../../../../src/modules/tasks-dashboard/tasks-dashboard.invariants.md):

- **Each dashboard lens has one stable row shape:** upheld. The existing
  pinned action cells stay in the same columns at both geometries.
- **Dashboard controls state their selection and next action:** strengthened
  by exact cell proof for the cycle control at both geometries.
- **Task actions use the workspace and runtime seams:** upheld. Paint
  projection changed in the terminal emulator. Action routing did not change.

The remaining dashboard records concern task truth, motion, repository
scope, default visibility, CLI projection, pane citizenship, absent task
trees, and plugin lifecycle. They were unimplicated. The full dashboard smoke
still passed their existing arms.

The terminal behavior reviewed
[terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md):

- **The emulator is the single source of terminal screen state:** upheld.
  OSC 66 payloads still enter the one xterm parser.
- **Terminal emulator behavior is specified by byte fixtures:** strengthened
  with ST, BEL, and every-byte-boundary OSC 66 cases.

The PTY proof reviewed
[harness.invariants.md](../../../../scripts/harness/harness.invariants.md):

- **The terminal emulator is the harness screen oracle:** strengthened. The
  oracle now projects the OpenTUI dialect that the app emits after
  negotiation.
- **Declared harness geometry reaches Invar:** upheld by the 150 by 40 and
  120 by 36 app launches.
- **Harness waits observe conditions not frame ordinals:** upheld. Every new
  wait observes exact glyph cells.
- **Shared seam changes verify every consumer:** upheld by the successful
  full commit hook.

The project records in
[project.invariants.md](../../../../project.invariants.md) were also checked:

- **Terminal color and glyph support varies:** strengthened by preserving the
  negotiated glyph dialect.
- **Appearance is data with a capability fallback:** upheld. The theme ladder
  remains the only glyph resolver.
- **Cost tracks the actively observed set:** upheld by the 500-task drive.
- **Coverage may fall, never silently:** strengthened by the new driven and
  byte-fixture assertions.
- **Seams are drawn at the shared generator:** upheld. The fix lives in the
  one terminal emulator instead of each glyph consumer.

Missed implicated records: none.

## Bycatch

- `FrameProbe.read` treats the current OpenTUI `char` buffer values as packed
  Unicode code points. The buffer now carries native character handles. The
  probe displayed Linear B characters such as `𐃩` while the raw PTY stream
  contained the correct task glyphs. This reproduced in two 120 by 36 drives.
  The task used the terminal emulator cells as its paint oracle. It did not
  change FrameProbe.
