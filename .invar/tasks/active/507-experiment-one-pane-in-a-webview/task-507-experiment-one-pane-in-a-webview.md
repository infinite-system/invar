# Task 507 — EXPERIMENT: one Invar pane in a webview over the live graph

Priority: user-directed
Engine: codex
Environment: any
Model: 5.6-sol
Effort: high
State: ACTIVE

## Provenance

EXPERIMENT. The branch never merges to main by the conductor; the
deliverables are the branch, the measurements, and the report. The
user adopts or discards.

## In plain words

Prove (or refute) the GUI thesis cheaply: mount the ivue class graph
in a browser context and render ONE surface — the bottom panel with
a terminal pane — as Vue components driven by the same class
instances the CLI uses. Measure the true reuse percentage and the
memory profile. No Electron/Tauri shell yet: a plain Vite + Vue page
served by Bun is enough to answer the question (the shell choice is
a later decision this experiment informs).

## The architecture to prove (see project.gui-feasibility.md)

- Model in the page: WorkspaceSet/PanelHost/plugins boot in browser
  JS. The 12 Bun-coupled capability classes (census in the
  feasibility note) get BROWSER stubs via the namespace Class-slot
  swap (the kernel-swap seam): PTY/git backed by a WebSocket to a
  Bun daemon reusing the existing system classes.
- The daemon is dist/iv machinery headless: OpenPty + Processes +
  the graph channel over a socket instead of files.
- One Vue component tree renders panelHost state: space tabs, pane
  tabs, and a terminal pane fed by the daemon's PTY stream
  (xterm.js or a minimal DOM grid — builder's call, justify it).

## Measurements the report must end with

1. Reuse: count of src/ modules imported UNCHANGED into the page
   bundle vs stubbed vs excluded (the census scripts' method).
2. Memory: page heap + daemon RSS with 1 and 10 workspaces open.
3. The friction list: every place the model assumed a terminal
   (screen cells, key routing) — this list IS the real cost of the
   full GUI, and honesty here outranks a pretty demo.

## Bounds

Read-only pane is acceptable if input routing balloons; drag-and-drop
one file onto the page to open it IS in scope (the user's original
itch). Keep the daemon changes additive (no CLI behavior change);
gate-relevant code stays untouched or the experiment overreached.
