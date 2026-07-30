# #340 — opening a file reveals and selects it in the file tree

State: COMPLETED — 78de90d2 — tree reveal + button row; red is #337's class, now promoted
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high

## The request (user, 2026-07-30, verbatim intent)

1. Opening a file (any route: tree click, quick open, goto-definition,
   palette) reveals it in the file tree by default: ancestor folders expand,
   the row scrolls into view, the row is selected.
2. A setting turns this off (name it in the settings family style, e.g.
   `fileTreeRevealOpenFile`, default true).
3. Under the "Files" header line in the tree pane: a circled-dot button
   (target/locate glyph) that reveals the CURRENT file on demand. Visible at
   least when the setting is off. This is the first header button — lay the
   header-button row out so #341's add-file and add-folder buttons join it
   without rework.

## Boundaries

- Reveal never steals keyboard focus from the editor.
- Reveal is a scroll/selection change only — one writer per scroll regime
  (adopt-and-stop), no parallel scroll math.
- Hidden files: if the opened file is filtered (hidden dotfile with
  fileTreeShowHiddenFiles off), reveal must not crash; define and report the
  chosen behavior.
- Scale parity: reveal in a deep tree (thousands of entries) must not lag.

## Follow-up

#341 (add file/folder buttons, per-node context add, drag-and-drop with
highlight + confirm) builds on this header-button row. It waits until this
lands.
