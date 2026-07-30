# READY — the child owns its I/O bundle

Status: READY

This bundle completes [terminal mouse passthrough to child apps (#313)](../../completed/313-terminal-mouse-passthrough-to-child-apps/task-313-terminal-mouse-passthrough-to-child-apps.md)
and [child terminal colors must not be themed (#315)](../../completed/315-terminal-child-colors-must-not-be-themed/task-315-terminal-child-colors-must-not-be-themed.md).
The worktree is clean. Both task commits passed the enforcing hook without `SKIP_GATE`.

## Shared boundary

The child-cell boundary now owns both kinds of child I/O. Invar owns pane borders, titles, padding,
selection paint, controls, and status chrome. A terminal child owns the colors of its cells and mouse
events inside those cells after it requests mouse tracking.

The decision lives once in [the terminal contract record](../../../../src/modules/terminal/terminal.invariants.md#pane-chrome-and-child-cells-keep-separate-authority).
The [theme contract](../../../../src/modules/theme/theme.invariants.md#appearance-comes-only-from-theme-data),
[project contract](../../../../project.invariants.md#appearance-is-data-with-a-capability-fallback),
and [native agent contract](../../../../src/modules/agent/agent.invariants.md#an-agent-session-is-a-structured-event-stream-not-a-screen)
cite that boundary. The native agent pane remains a host projection of structured events. Claude Code
running as a PTY guest remains a terminal child.

The mouse decision follows the [xterm mouse tracking
protocol](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#Mouse%20Tracking): DECSET 1000
requests press and release, 1002 adds pressed motion, 1003 adds all motion, and 1006 selects SGR
encoding. Wheel input uses the child's selected mouse protocol while child mouse tracking or the
alternate screen owns the gesture. Otherwise, Invar scrollback owns it.

The color decision uses separate terminal color roles. VS Code documents
[terminal foreground, background, and ANSI roles separately from panel
colors](https://code.visualstudio.com/api/references/theme-color#integrated-terminal-colors). Its
[terminal appearance guide](https://code.visualstudio.com/docs/terminal/appearance#_terminal-colors)
also states that the active color theme supplies ANSI colors unless the terminal roles are customized.
Invar has no separate user terminal palette. It now uses the standard xterm palette and fixed xterm
defaults instead of substituting the Invar workbench foreground and panel background.

## Terminal mouse passthrough (#313)

### Diagnosis

> `@xterm/headless` already parsed and retained the child's mouse modes. The missing link was after
> parsing: `TerminalPaneContent.onPointerDown` always began host selection, pointer release had no
> pane-local context, and no pointer route wrote mouse bytes to the child PTY.

The pre-fix [diagnostic
probe](../../../../.invar/tasks/in-progress/313-child-owns-its-io-bundle/313-child-io-diagnostic-probe.ts)
reported `clickBytes=none` at both `100x30` and `160x50`. Code inspection ruled out the first ranked
hypothesis and confirmed the second. It also showed that any future forwarding needed one coordinate
translation at the pane boundary.

### Fix

- [TerminalMouse](../../../../src/modules/terminal/TerminalMouse.ts) is the one encoder for SGR and
  legacy mouse input. It respects the child's tracking mode, encoding mode, buttons, modifiers, motion,
  and wheel requests.
- [TerminalPaneContent](../../../../src/modules/terminal/TerminalPaneContent.ts) forwards only events
  inside the child grid. It subtracts pane padding and emits child-local, one-based coordinates.
- Mouse mode off keeps the existing Invar selection route and sends no pointer bytes.
- Pane padding and chrome never forward to the child.
- Wheel ownership uses the same child-mode boundary and leaves host scroll position unchanged when the
  child owns the wheel.

Commit: `133338baf61d3a2ade123184b4b14be0fd20d12e` — fix terminal mouse passthrough for child apps
(#313).

### Evidence

- The diagnostic probe returned
  `"\u001b[<0;4;1M\u001b[<0;4;1m"` at both `100x30` and `160x50`.
- [TerminalMouse tests](../../../../src/modules/terminal/TerminalMouse.test.ts) and
  [TerminalPaneContent tests](../../../../src/modules/terminal/TerminalPaneContent.test.ts) cover
  tracking modes, exact coordinates, padding, mouse-off selection, wheel ownership, and protocol
  polarity.
- The shared [terminal PTY
  harness](../../../../scripts/harness/smoke-terminal-harness.ts) receives the exact SGR press and
  release pair, receives one SGR wheel event, observes unchanged host scroll state, and proves that a
  mouse-off click sends no bytes.
- A positive-control coordinate plant changed the press to column 5. The real PTY harness failed with
  `FAIL child received exact SGR click "\u001b[<0;5;1M\u001b[<0;4;1m"`. Removing the plant restored
  the exact pair.
- [The real-child
  probe](../../../../.invar/tasks/in-progress/313-child-owns-its-io-bundle/315-real-child-color-probe.ts)
  launched Claude Code 2.1.220. Claude enabled child mouse ownership. Twelve upward wheel events
  exposed its `Jump to bottom (ctrl+End) ↓` control. A real click at screen cell `70,31` returned the
  transcript to its newest `25. test` line.

## Child terminal colors (#315)

### Diagnosis

> The emulator preserved ANSI palette and truecolor metadata. `TerminalPaneRenderer` changed only
> default colors: `foregroundHex` returned the active Invar `palette.fg`, and `backgroundHex` returned
> `palette.panel`.

Before the fix, FrameProbe observed default foreground `169,177,214,255` and default background
`22,22,30,255`. ANSI white was already `192,192,192,255`, ANSI black background was
`0,0,0,255`, and the truecolor sample remained `18,52,86,255` on `101,67,33,255`. The same result
appeared at `100x30` and `160x50`. This ruled out OpenTUI and emulator remapping. The substitution was
the renderer's default-color fallthrough.

### Fix

- [TerminalPaneRenderer](../../../../src/modules/terminal/TerminalPaneRenderer.ts) maps terminal
  defaults to xterm foreground `#c0c0c0` and background `#000000`.
- ANSI slots, 256-color indexes, and truecolor continue to map from emulator cell metadata.
- Every child background is explicit. The pane background can no longer leak through a default child
  cell.
- Host selection remains a host overlay. Padding, line framing, status, borders, and controls still
  read the live Invar palette.

Commit: `f130ee0f2a3355cf44c286a5d32b7a33bf4dc7c4` — preserve child terminal colors (#315).

### Evidence

- The shared PTY child emits default foreground and background, all 16 ANSI foreground and background
  slots, indexed colors 196 and 21, and a truecolor foreground and background.
- FrameProbe checks every cell's exact RGBA lanes under the dark theme and after a live switch to the
  light theme. All child lanes stay unchanged. The status chrome background changes.
- The small and large diagnostic drives both report default foreground `192,192,192,255`, default
  background `0,0,0,255`, and unchanged ANSI and truecolor controls.
- A planted slot-15 remap from `#ffffff` to `#fefefe` made the shared harness fail at
  `FAIL dark theme keeps ANSI foreground 15 exact`. Removing the plant restored the harness.
- The real oh-my-zsh 5.9 session loaded the robbyrussell theme. Its reference output produced green
  `0,128,0,255`, normal white `192,192,192,255`, bright white `255,255,255,255`, and indexed red
  `255,0,0,255`.
- The real Claude Code session contained two pure-white child cells at `255,255,255,255`. It also
  enabled child mouse ownership, so the same real run covered color and click acceptance.

## Verification

- The mouse passthrough commit hook ended `GATE_EXIT=0`.
- The child color commit hook ended `GATE_EXIT=0`.
- The final gate passed conventions, Prettier, 1,961 unit tests, 62 parallel PTY smokes, the serial
  behavioral contracts, agent permissions, overlay dialogs, and the input-byte timing check.
- The invariant checker resolved 1,154 annotations and 222 lattice links with 0 problems.
- No full tmux audit ran. The gate reported the expected 37 opt-in tmux audits as skipped.

## Bycatch

- FIXED: [unknown task variables pass through
  (#305)](../../completed/305-unknown-task-variables-pass-through/meta.json) lacked its final newline.
  Prettier blocked the first mouse-task commit. Commit
  `429a73ee354b85e44e0375839c7e573c26e1961b` contains only that metadata repair.
- The mouse-task gate saw bounded-list-popup, git-watch, and panel-chrome smokes pass only on retry.
  Each first attempt was preserved by the gate as a flake.
- The first final color-task gate could not derive the Markdown preview border in the scrollbar smoke.
  The next full hook run passed the scrollbar smoke without retry. That final run then needed one
  starvation-class retry for the panel-chrome smoke.
- Contract drift: [the emulator single-source record](../../../../src/modules/terminal/terminal.invariants.md#the-emulator-is-the-single-source-of-terminal-screen-state)
  still cites the old `scripts/smoke-terminal.sh` path and command instead of the current PTY harness.
  I did not change this unrelated record.
- FIXED outside the repository: launching the first Claude acceptance probe with an isolated `HOME`
  let Claude's updater repoint `/home/parallels/.local/bin/claude` to that temporary home. Probe
  cleanup then left the link dangling. I restored it to
  `/home/parallels/.local/share/claude/versions/2.1.220`, verified `claude --version`, and changed the
  probe to launch Claude with its real home. No temporary target remains.
