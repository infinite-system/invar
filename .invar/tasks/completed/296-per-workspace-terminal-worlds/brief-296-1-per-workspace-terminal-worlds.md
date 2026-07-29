# Brief — #296: terminals double on workspace open; each workspace owns its terminal world

Read first: [task-296-per-workspace-terminal-worlds.md](task-296-per-workspace-terminal-worlds.md)
— USER-DIRECTED; his verbatim design intent is in the record and it
GOVERNS: terminals are per-workspace parallel worlds.

Arms:

1. **Reproduce the doubling**: open a second workspace; the bottom pane
   shows both workspaces' terminals. Quote the frame + status.
2. **Design implementation**: each workspace owns its terminal SET.
   Switching workspaces switches the visible world; the hidden world's
   terminals keep running (processes + scrollback intact) and return
   exactly on switch-back. Agent panes follow the same law. Build on
   the panel content-set machinery + workspace lifecycle (#294 just
   proved the suspend/resume provider pattern at the LSP seam — same
   shape).
3. **Disposal semantics**: decide from the workspace/plugin lifetime
   records what closing a workspace does to its world; state the
   decision and record it.
4. **Both polarities**: A's terminals never visible in B; A→B→A
   restores A's exact set; NEW terminal created in B lands only in B's
   world; the doubling reproduction becomes the regression contract.

Real PTY, both scales where relevant; positive control per arm.

## Invariants in scope

The terminal records; PanelHost/content-set records; workspace records
(WorkspaceSet suspend/resume); plugin lifetime records in
[plugins.invariants.md](../../../../src/modules/plugins/plugins.invariants.md).

## Bycatch expected

Per [AGENTS.md](../../../../AGENTS.md)'s taxonomy. The READY report
carries `## Bycatch` even if it reads `None observed`.

## End state (mechanical)

READY report: doubling reproduced then contracted, world isolation +
restoration driven both polarities, disposal decision recorded, green
`bun test` + terminal/panel/workspace smokes. The conductor gates at
landing.
