# Brief — BUNDLE: terminal pane fidelity 2 (#320 theme defaults/palette + #321 flicker/sync)

Two USER-DIRECTED tasks in the same pane code — the render path of the
terminal pane. Read both records first; verbatim words govern:

- [task-320-terminal-default-bg-theme-and-vscode-ansi-palette.md](../../active/320-terminal-default-bg-theme-and-vscode-ansi-palette/task-320-terminal-default-bg-theme-and-vscode-ansi-palette.md)
- [task-321-terminal-flicker-child-tui-repaints.md](../../active/321-terminal-flicker-child-tui-repaints/task-321-terminal-flicker-child-tui-repaints.md)

Context: #313/#315 just landed (mouse passthrough + child-color
exactness) — build on current main. #320 CORRECTS #315's overshoot:
the chrome-vs-child boundary stays, but DEFAULT fg/bg and the 16 ANSI
slots become theme-derived (VSCode's model + its documented default
palette values, cited), while child-EXPLICIT truecolor/256/OSC-4 lanes
stay byte-exact. Do not weaken #315's contract — evolve it; its
planted-remap controls must keep passing for explicit lanes.

## Work discipline

- ONE COMMIT PER TASK NUMBER (#320 then #321), full gate through the
  enforcing hook, NO SKIP_GATE product commits.
- #320 first: it changes what correct frames LOOK like; #321's
  frame-capture asserts then build on the corrected colors.
- #321: diagnose FIRST — capture tasks:watch's actual per-frame bytes
  and the pane's paint sequence before touching anything. Then: DEC
  2026 synchronized-update honoring for children (atomic commit,
  unclosed-bracket timeout per spec, cited) + tasks:watch converted to
  cursor-home/diff repaints bracketed in 2026 and data-driven cadence.
- Both polarities per the records; real drives: oh-my-zsh git:(main)
  shows VSCode-default blue/green; Claude drive default bg equals theme
  terminal background across a live theme switch; real tasks:watch
  frame capture shows zero blank/partial intermediate frames; non-2026
  child unaffected.

## Invariants in scope

terminal records (the #315 boundary contract — evolve), theme records
(new terminal.background/foreground + ANSI palette tokens), the
tasks:watch script, FrameProbe conventions (code-point indexing,
truecolor).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report with per-task sections (diagnosis quoted, evidence, commit
hash each), GATE_EXIT=0 through the hook on the final commit. The
conductor gates at landing and completes both records.
