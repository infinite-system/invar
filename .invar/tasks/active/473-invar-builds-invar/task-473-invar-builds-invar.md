# Task 473 — invar builds invar

Priority: user-directed
State: ACTIVE — accumulating; mirror mode already SHIPPED
Engine: claude
Environment: any
Model: fable-5
Effort: high

## The user's direction, verbatim (2026-08-02)

"whether we can make an Invar instance load into the editor window itself and
then when Claude with Invar mcp or an Invar Agent with Invar mcp, will be able
to move it's mouse and I can see a trail of cells its mouse has moved via Pty
and I can see it opening the dropdowns and changing state of the app, live?
So basically it's pty + invar inside it + mcp control via DriveSession +
graph access?" and then: "Make invar build invar".

## The composition — every piece named, most already exist

- Terminal panes run arbitrary PTYs (exists): the WINDOW for the inner app.
- Agent pane runs real Claude/codex (exists, a45f960): the DRIVER's seat.
- Drive server (exists, #472): one warm inner Invar, attachable cross-process.
- Graph channel (exists, #469): read/wait/set on the inner app's live state.
- Real-PTY gestures (exists): the agent's hands.
- **--mirror (SHIPPED with this task's filing):** the drive server relays the
  inner app's raw bytes to its own stdout and inherits the hosting terminal's
  geometry — run `bun scripts/harness/DriveSession.ts --serve --mirror` inside
  an Invar terminal pane and the pane SHOWS the driven app live. Verified:
  an attached Ctrl+J pushed 4.6KB of ANSI to the mirror.

## Remaining work

1. **Pointer trail overlay (app-side).** Terminals paint no mouse cursor, so
   synthetic pointer movement is invisible. Env-gated overlay (harness
   enablement family): paint the current pointer cell plus a fading trail of
   recent cells, fed by the app's own mouse events — the trail shows exactly
   the gestures that arrived, not a reconstruction. This makes the agent's
   hand VISIBLE in the mirrored pane.
2. **Invar MCP server.** Thin stdio MCP wrapping the existing protocols:
   drive_attach(snippet), graph_get(path), graph_await(path,value),
   graph_set(path,value) [experiment-only framing], screen(), server
   start/stop. Claude in the agent pane with this MCP = full control of the
   inner instance. No new capability — only a new doorway to #469/#472.
3. **Resize forwarding (small).** The mirror inherits geometry at start;
   forward SIGWINCH/pane resizes to driver.resize so the inner app follows.
4. **The demo loop.** Outer Invar: agent pane (Claude + Invar MCP) on one
   side, terminal pane running the mirrored drive server on the other. The
   agent edits this repo, rebuilds, restarts the inner instance through the
   server, and verifies its change by DRIVING the inner app — visibly. That
   is invar building invar.

## Boundaries

- The inner app is driven ONLY through real PTY input (the harness's founding
  invariant); the MCP exposes the existing verbs, it does not invent a
  teleport path.
- Mirror is watch-only in v1: the human's keyboard in the hosting pane does
  not feed the inner app (double-driving is a coherence hazard; a deliberate
  handover mode can come later).
- graph_set stays experiment-framed per the read-only record.

## Verification

Drive the demo loop end to end in the harness (outer Invar in a PtyTestDriver,
inner via the mirrored server) and assert: the mirror pane repaints on agent
gestures; the trail cells appear on pointer moves; an MCP tool call round-trips
a graph read.
