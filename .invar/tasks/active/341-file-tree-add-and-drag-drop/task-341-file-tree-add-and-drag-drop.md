# #341 — file tree: add file/folder anywhere, drag-and-drop with confirm

State: ACTIVE
Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
Blocked-by: #340 (header-button row and reveal must land first)

## The request (user, 2026-07-30)

1. Header buttons beside #340's circled-dot: add-file and add-folder
   (create at the selected node's level, or root when nothing is selected).
2. Right-click on any folder or file: context menu gains "New File" and
   "New Folder" at that level. Easy creation at ANY depth.
3. Drag and drop files/folders within the tree: while dragging, highlight
   the current drop target (the folder that would receive the item); on
   release, a confirmation dialog states source and destination before ANY
   filesystem move executes. No move without explicit confirm.

## Boundaries

- Destructive-operation rule applies: the move confirm is a real distinct
  confirmation (project convention: destructive ops execute only behind an
  explicit confirmation distinct from the gesture).
- One mouse event, one handler path; hit-testing shares the tree's existing
  row geometry model — no parallel math.
- Name collisions on move/create: define behavior (block + message), never
  silently overwrite.
- Watcher coherence: created/moved entries appear via the existing tree
  refresh path; open buffers pointing at moved files must follow the move or
  define their behavior explicitly.
- Scale parity: drag over a huge tree stays smooth.

## Filed, not dispatched

Waits for #340. Re-derive the design against the landed header-button row at
dispatch time.
