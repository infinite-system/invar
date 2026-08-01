# Task #435 — folder-open task launch hygiene

Priority: user-directed
Engine: codex
Environment: linux
Model: 5.6-sol
Effort: high
State: IN-PROGRESS

## What

Opening ~/dev/realized as a workspace produced about nine terminals for
the user. Conductor-driven mechanism (2026-08-01, drive with
--home /tmp/drive-realized-home-a --env INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS=0,
three runs on one home):

1. `launchFolderOpen` in `src/modules/tasks/TaskLauncher.ts` launches
   every `runOnFolderOpen` task on EVERY `opened()` call. It never
   consults its own `launchedIdentifiersByWorkspace` map.
2. The `Displaced: Claude` configuration warning materializes as a
   terminal-like content (`task:...:2:error`).
3. Session restore is inconsistent: after restart the panel restores
   only `database-space-restored-1` while task contents persist as
   instances. Restored terminals and fresh launches stack.

## Wanted (user: "it has to be reasonable")

- Launch folderOpen tasks ONCE per workspace root per app session. Use
  the existing identifier map.
- Never launch a task whose identifier session restore already brought
  back.
- Configuration issues render as a panel notice, not a pseudo-terminal.
- Session restore restores the Terminal space consistently with its
  task contents.

## Evidence

Driven status transcripts in the conductor session, 2026-08-01. Key
observations: run 1 `taskLaunchedLabels=["Claude","Terminal"]` with
`panelCellIds` two task cells; run 3 `panelContentIds` gained
`task:...:2:error`; run 3 `panelSpaceIds=["database-space-restored-1"]`
only.
