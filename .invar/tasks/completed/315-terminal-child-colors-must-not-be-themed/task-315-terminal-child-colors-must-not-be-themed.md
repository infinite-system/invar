# 315 — terminal + agent panes: child app colors must not be re-themed

State: COMPLETED — f130ee0f — child terminal colors never re-themed
Engine: codex
Model: 5.6-sol
Effort: high
Provenance: USER-DIRECTED 2026-07-29

## User's words (verbatim, GOVERNS)

> Another issue that our theme modifies how both terminal and even
> claude code coloring looks like, we have to fix that, don't have that
> issue in vscode, in invar the claude code text color becomes blue but
> in vscode terminal it says white, same for terminal oh my zsh colors
> are different in invar, have to make them remain the same

## Design

- A child process's output owns its own colors. The 16 ANSI palette
  slots, 256-color palette, truecolor values, and DEFAULT
  foreground/background of terminal/agent panes must render what the
  child asked for — not Invar theme tokens. (VSCode parity: its
  terminal keeps its own palette independent of the workbench theme.)
- Diagnose FIRST, measure before briefing a cause: drive a child that
  prints a known color matrix (16 ANSI fg/bg + default fg + truecolor
  swatches), capture cells with FrameProbe (code-point indexed,
  COLORTERM=truecolor), and diff what came out vs what was requested.
  Locate exactly where the substitution happens (terminal renderer
  mapping ANSI -> theme palette? default-fg falling through to theme
  foreground? OpenTUI color handling?).
- Decide + record the boundary: pane CHROME (borders, titles, status)
  stays themed; the child's CELL CONTENT does not. If a theme wants to
  supply the terminal's default bg, follow what VSCode actually does
  (cite) and record the decision.
- Both polarities: child-requested colors arrive byte-accurate in the
  frame (planted remap goes red); Invar chrome around the pane still
  follows live theme switch; a theme switch mid-session does NOT
  repaint existing child content colors.
- Real acceptance: Claude Code text renders white (its own choice) in
  the agent pane; oh-my-zsh prompt colors match a reference VSCode/
  plain-terminal capture of the same prompt.

## Acceptance

Color-matrix harness proves all 16 ANSI slots + default fg/bg +
truecolor pass through unmodified at both scales, across a live theme
switch; real claude/zsh drives quoted before/after.
