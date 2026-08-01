# Brief 435-1 — folder-open task launch hygiene

Read [.claude/skills/ibr/IBR.md](../../../../.claude/skills/ibr/IBR.md) in full before any governed work. This
touches governed code.

## The defect, seen by driving

Opening `~/dev/realized` as a workspace stacks terminals across opens.
The user saw about nine. Reproduce it yourself FIRST, before any code:

    bun run drive --open /home/parallels/dev/realized \
      --home /tmp/drive-435-home \
      --env INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS=0

Run it three times on the same `--home`. Watch `panelContentIds`,
`taskLaunchedLabels`, `panelSpaceIds`. Conductor-driven facts
(2026-08-01):

- Run 1: `taskLaunchedLabels=["Claude","Terminal"]`, two task cells.
- Run 3: `panelContentIds` gained `task:...:2:error` (the
  `Displaced: Claude` warning wearing a terminal), and
  `panelSpaceIds=["database-space-restored-1"]` only — the Terminal
  space is gone while its task contents persist.

## Mechanism (verified, start here)

1. `launchFolderOpen` in
   [TaskLauncher.ts](../../../../src/modules/tasks/TaskLauncher.ts)
   launches every `runOnFolderOpen` task on EVERY `opened()` call and
   never consults its own `launchedIdentifiersByWorkspace` map.
2. Configuration issues become terminal-like contents through the same
   launch port (`task:...:N:error`).
3. Session restore restores a Database-only space while restored task
   contents remain as instances; the next folderOpen launch adds more.

## The task

1. Launch folderOpen tasks ONCE per workspace root per app session,
   through the existing identifier map. Reopening or switching to an
   already-opened root launches nothing new.
2. If session restore already restored a task content with the same
   identifier, do not launch a duplicate.
3. Render configuration issues as a panel notice, not a pseudo-terminal
   content. Keep the information (label, message, severity) visible.
4. Make session restore consistent: the Terminal space returns with its
   task contents, or the contents do not return either. Drive the
   restart path with `bun run drive --home` (two runs, one home) and
   state which end state you chose and why.
5. Iterate by DRIVING (drive -> change -> drive). Write the contract
   only after the symptom is gone: extend the tasks smoke
   ([smoke-tasks-harness.ts](../../../../scripts/harness/smoke-tasks-harness.ts))
   to lock once-per-root launching and the no-pseudo-terminal rule.
   Both arms: prove the launch fires on first open (present arm) and
   stays silent on reopen (absent arm).

## Invariants in scope

- Folder open starts declared tasks — in
  [tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md).
  Your change REFINES this record: once per root per session is the
  sharper statement. Propose the refined wording.
- File sources report displaced built-ins — same contract. The notice
  rendering must keep this true.
- Check the panel/session-restore contracts for records about restored
  spaces before changing restore behavior; report any record the brief
  missed.

## Bycatch expected

Report per the bycatch taxonomy in
[AGENTS.md](../../../../AGENTS.md): runtime defects, invariant
violations, comment drift, distillation possibilities, generator
drift, plain nonsense. Carry a `## Bycatch` section even when it reads
`None observed`.

## End state

A report file in this folder. Smoke green with both arms proven. Do
not run `scripts/merge-gate.sh` — the conductor gates at landing. Do
not push. A gate may be running when you start; do all reading and
driving first, and keep heavy test runs for after your first hour.
