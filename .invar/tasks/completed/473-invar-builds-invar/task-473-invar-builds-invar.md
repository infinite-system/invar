# Task 473 — invar builds invar

Priority: user-directed
State: COMPLETED — da9f70f2 — Landed: the MCP doorway + seven instrument fixes, MCP-client-verified at both scales. Bycatch converted: #476 filed (reload keeps a disposed session on boot failure); reach-completeness record still awaits the user. Remaining in the invar-builds-invar vision: the live demo loop with the user watching.
Engine: codex
Environment: any
Model: 5.6-sol
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

## Mirror hardening shipped after live sessions with the user (2026-08-02)

- Stdout exclusivity: server chatter goes to server.log (log lines were
  clobbering cells the app never repaints — blanked the activity bar).
- Watch-only stdin: raw mode + swallow; Ctrl+C files a stop request.
- cwd workspace default and settings seeded BY COPY from the real config.
- Host terminal identity (TERM family) forwarded to the inner app.
- Least-capable-link negotiation: TerminalEmulator textSizingSupported=false
  in mirror mode, so the OSC 66 probe fails as it does on the real terminal
  and glyphs travel plain. Verified by the user: icons visible.
- Conductor family 17 (two oracles, one byte stream) records the method.

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

## PTY usability feedback from builders (the user's tracked question)

From #470's builder (codex, 2026-08-03, first overnight PTY use):
- EASY: the warm server ("made the render transition easy to see without
  rebooting between samples"); `--size` fixtures; `app.show` for compact
  evidence. The primary loop works for builders as designed.
- GAP 1: `renderQuiescent` is status-projection-only, so `app.get`/`waitFor`
  cannot address it — the fluent loop needs EITHER a condition wait on
  status fields OR a renderer-lifecycle graph root. (Do not double-expose;
  pick one and document the status-versus-graph split in the drive help.)
- GAP 2: `app.show` has no label argument — a label is treated as another
  status path. Small ergonomics fix.
- Add both to this task's implementation round alongside the MCP doorway.

From #471's builder (codex, 2026-08-03):
- EASY: warm server fast loop; clickText/waitFor/get in one probe; loud
  misses made contributor discovery immediate.
- GAP 3: `bun run drive` and DriveSession have DIFFERENT stop commands —
  unify or document in the skill.
- GAP 4: DriveSession has no generated `--size` fixture option (builder fell
  back to the scale smoke for the large arm).
- BUG: a failed `--attach` snippet prints the failure but can exit 0
  (observed once with a wrong-path probe) — a script can overlook a failed
  positive control. Verify and fix the exit-code path.
- PROPOSED RECORD (needs the user): a reach-completeness record in
  system.invariants.md — "the composition graph reaches every installed
  contributor" — the behavior now promises it, no record states it.
