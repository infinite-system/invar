# #361 — clicking a tasks activity icon triggers panel-remove warnings then a terminal buffer crash

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: medium

## The report (user, 2026-07-30 ~04:45, verbatim log; running bundled dist/iv)

Clicked one of the tasks activity items icons ("not sure which — needs
investigation"). The error popped up OVER the Invar editor. Files open at
the time: project.conductor.archive.md, project.conductor.md. User suspects
OpenTUI.

[04:41:38] [WARN] 'Renderable with id panel-contents-list is not a child of panel-box, skipping remove'
[04:41:43] [WARN] 'Renderable with id panel-cell-region-1 is not a child of panel-box, skipping remove'
[04:41:43] [WARN] 'Renderable with id panel-cell-divider-0 is not a child of panel-box, skipping remove'
[04:45:46] [ERROR] Error: undefined is not an object (evaluating
  'this._activeBuffer.lines.get(this._activeBuffer.ybase+this._activeBuffer.y).isWrapped=1')
  TypeError: undefined is not an object (...)
    at lineFeed (/$bunfs/root/iv:951:29894)
    at parse (/$bunfs/root/iv:952:20073)
    at parse (/$bunfs/root/iv:951:25874)
    at _innerWrite (/$bunfs/root/iv:952:7564)

## Conductor triage (hypothesis, not diagnosis)

Two-phase signature. First, three panel-chrome removals warn that the
renderables are not children of panel-box (a tasks-icon click rearranges or
closes panel content). Four minutes later, lineFeed/parse/_innerWrite is
the embedded terminal emulator writing into a buffer whose line store no
longer has the row — the shape of a PTY write racing a
disposed-or-resized terminal buffer after the panel teardown. Candidates to
separate: (a) terminal pane torn down while its PTY keeps writing; (b)
buffer resize to zero rows while a write is in flight; (c) OpenTUI
renderable-tree mutation leaving the emulator attached to a dead surface.

## Method notes for the builder

- The warnings and the crash are 4 minutes apart — treat them as possibly
  independent; the warnings may only mark the teardown moment.
- Reproduce by driving: open files, click each tasks activity icon in
  turn, keep a terminal pane alive with output flowing, watch for the
  warn/crash pair. A lifetime/ownership defect needs at least two
  participants (the click teardown AND a writing PTY).
- Bundled-path frames (/$bunfs/root/iv) mean the user ran the release
  bundle; reproduce in dev first, confirm in bundle.

## Invariants in scope (candidates at dispatch)

- terminal module contract (buffer/PTY ownership records) and panel/layout
  records; #359's panelContentOrder evidence may be adjacent (same panel
  cell machinery).
