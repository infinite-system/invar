# Brief 507-1 — EXPERIMENT: one Invar pane in a webview over the live graph

## In plain words

Prove the GUI thesis cheap and honest: the same ivue class graph that
drives the terminal renders ONE surface in a browser page — the
bottom panel with a live terminal — with Bun-only capabilities
swapped through the namespace Class slots and a thin daemon carrying
PTY bytes over a WebSocket. End with three measurements, not a demo.
[The task file](task-507-experiment-one-pane-in-a-webview.md) is the spec; [the feasibility note](../../../../project.gui-feasibility.md) is the map.

## Provenance rules (EXPERIMENT)

Your branch NEVER merges to main. Deliverables: the branch, the
measurements, the friction list. Additive daemon changes only — if
you need to modify existing src/ behavior (not just add), STOP and
report the need instead; that finding is a result, not a blocker to
route around.

## Order of work

1. Daemon first: a headless Bun entry (scripts/ or a new bin) that
   boots the system tier (OpenPty, Processes, git) + the graph
   channel over a WebSocket. Reuse existing classes; no forks.
2. Browser kernel: Vite + Vue page that boots the MODEL (WorkspaceSet,
   PanelHost, DefaultPlugins minus what cannot run) with browser
   stubs swapped into the 12 census slots (GitCommands -> socket,
   OpenPty -> socket stream, sqlite -> stub/skip the database plugin).
   Document every plugin you had to exclude and why.
3. One component tree: space tabs + pane tabs + a terminal pane fed
   by the daemon stream. Renderer for the terminal is your call
   (xterm.js vs minimal DOM grid) — one paragraph justifying it.
4. Drag-and-drop one file onto the page to open it in a (read-only ok)
   editor pane — the user's original itch, smallest honest version.
5. Measure: unchanged/stubbed/excluded module counts (census method);
   page heap + daemon RSS at 1 and 10 workspaces; the friction list
   of every terminal assumption the model leaked.

## Reproduce by DRIVING first

Before building, drive the CLI's bottom panel once on the warm server
and screenshot the graph paths you will mirror (panelHost.activeSpace
shape etc.) — the page renders THOSE paths, so the mapping is
explicit from hour one.

## Invariants in scope

- Graph observation reads and never mutates; Observability never
  crashes the app ([src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md)) — the
  socket graph channel inherits both.
- Terminal bytes cross exactly one backend seam
  ([src/modules/terminal/terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md)) — the daemon must
  not add a second byte route.
Answer record by record for anything you touch; name misses.

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy even when None observed.

## Instrument feedback

EASY / CONFUSING / MISSING; asks get converted.

## Rules

Never run scripts/merge-gate.sh; worktree commits skip the full gate
via the planted policy; the conductor reviews — this branch is not
landed.
