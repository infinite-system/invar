# Brief 356-1 — the agent pane becomes a plugin with an on-off switch

## In plain words

The agent module is already extracted, but no AgentPlugin exists: the
app wires the agent pane by hand inside Bootstrap. Make the agent a
contributor like git or markdown, with the same enable and disable
knob. Disabled means fully absent. The #488 census mapped every site
you must relocate; work from its list, not from a fresh search.

## Reproduce by DRIVING first

Drive the app (drive-pty skill: warm headless server in your
worktree). See the agent pane exist: open it, see its activity-bar
entry, chords, and settings section. That is the surface that must
survive relocation unchanged when enabled, and vanish when disabled.

## Your map — read these before any code

- [The #488 census report](../../completed/488-core-to-plugin-coupling-census/report-488-core-to-plugin-coupling-census.md):
  row 1 (Bootstrap: 8 agent imports + createAgent wiring + label
  matching), row 2 (agent chords and 'Agent' category in keybinding/
  command defaults), row 3 (agent settings schema declared in core),
  row 5 (StatusBar agent button), row 9 (AppStatusProjection agent
  ports), row 10 (narration type import).
- The census scripts (same folder) are your before/after measure:
  re-run both; the agent counts must reach zero except DefaultPlugins.
- [The task file](task-356-agent-pane-is-a-decoupled-module.md) —
  the user's verbatim request and the #487 evidence section: Bootstrap
  branches on AgentPaneContent.Class before the generic pane route,
  which two contracts already call a disagreement. Your change must
  REPAIR that (the agent rides the generic PaneContent route), not
  relocate the special case.

## The shape

1. AgentPlugin as an ApplicationContributor in DefaultPlugins, using
   the existing context seams the other plugins use:
   registerKeybindings, commands, registerSetting, statusBarSegments,
   statusProjectionContributions, pane content registration.
2. Disabled = fully absent: no pane, no activity-bar entry, no chords,
   no settings section, no background processes, no status projection.
   Enabled restores all of it. The extensions section shows the knob.
3. Terminal and agent fully independent: each works with the other
   absent. A genuinely shared generator gets a named seam, never a
   copy.
4. Iterate by driving; write locking smokes at the END (enable/disable
   round trip: pane, chords, settings, status all appear and vanish).

## Invariants in scope

- The agent pane is a PaneContent citizen, not a special case
  ([src/modules/agent/agent.invariants.md](../../../../src/modules/agent/agent.invariants.md)) — currently DISAGREED by
  Bootstrap; your change makes it true.
- A focused panel routes keystrokes to its active pane content
  ([src/modules/ui/ui.invariants.md](../../../../src/modules/ui/ui.invariants.md)) — same disagreement, same repair.
- The composition graph reaches every installed contributor
  ([src/modules/system/system.invariants.md](../../../../src/modules/system/system.invariants.md)) — the agent comes UNDER
  this record when it becomes a contributor.
- Render load is attributed at the contribution boundary
  ([src/modules/app/app.invariants.md](../../../../src/modules/app/app.invariants.md)) — the agent's render load becomes
  attributed once contributed.
- The terminal is a runtime plugin
  ([src/modules/terminal/terminal.invariants.md](../../../../src/modules/terminal/terminal.invariants.md)).
Answer record by record; name what the list missed. Propose new
records where the decoupling creates real guarantees (propose-only).

## Coordination

- #495 (terminal copy) is in flight and may touch Bootstrap telemetry
  lines. Keep your Bootstrap diff surgical; the conductor resolves
  overlap at landing.
- #349 restyles the extensions list — do not restyle it here.

## Bycatch expected

Report per [AGENTS.md](../../../../AGENTS.md)'s bycatch taxonomy even when None observed.

## Instrument feedback

Report EASY / CONFUSING / MISSING about the drive layer; asks get
converted.

## Rules

- Never run scripts/merge-gate.sh; the conductor gates and lands.
- Commit on your branch as you go. READY report in the task folder.
