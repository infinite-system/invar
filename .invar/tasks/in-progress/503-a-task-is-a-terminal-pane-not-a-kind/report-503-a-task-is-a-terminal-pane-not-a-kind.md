# READY — Task 503, a task is a terminal pane with task metadata

## In plain words

A task pane used to tell the panel that each task was a different kind of thing. The first repair
made it a terminal, but `Ctrl+J` then mistook that task for the workspace's interactive terminal.
Task metadata now keeps those two terminal panes distinct, and both user paths work again.

## Result

Task 503 (a task is a terminal pane with task metadata) is ready at commit
`acabef5c687db1e21aeadaf265fa8e523f774c0c`.

- [TaskLauncher](../../../../src/modules/tasks/TaskLauncher.ts) still derives the stable
  `task:<encoded-root>:<index>` identifier. It now sends label, workspace root, and task source as
  pane metadata. It also owns all recognition of legacy task-prefixed saved values.
- [Bootstrap](../../../../src/modules/app/Bootstrap.ts) creates the task through the terminal
  runtime with kind `terminal`. Restore asks the task seam whether a saved pane is a declared task.
  It drops that dead entry before folder-open launch starts the declaration again.
- [PaneContent](../../../../src/modules/ui/PaneContent.interface.ts) owns the single task metadata
  shape. The terminal factory and terminal pane carry it without changing the pane kind.
- [RootView](../../../../src/modules/ui/RootView.ts) paints the active theme's task-record glyph in
  the task pane frame header. Paint, hover, and click use the same stored cell bounds. A real click
  opens the recorded source in the recorded workspace and returns focus to the editor.
- [TaskConfiguration](../../../../src/modules/tasks/TaskConfiguration.ts) records the exact file
  that supplied each file-backed task. This makes the glyph work for the `.invar/tasks.json`
  requested here and preserves the source for supported task files.
- [The panel chrome smoke](../../../../scripts/harness/smoke-panel-chrome-harness.ts) now covers the
  legacy saved shape, folder-open relaunch, task kind, theme glyph, real pointer click, saved-state
  healing, and the second boot at both scale ends.

The production `task:` literal census now has two sites. Both are in
[TaskLauncher](../../../../src/modules/tasks/TaskLauncher.ts), where they recognize the stable task
identifier and the legacy saved kind. The panel and Bootstrap no longer know that prefix.

## Round 2 repair

The first repair made the built-in task eligible for every kind-based terminal lookup. When
`Ctrl+J` asked for the workspace's interactive terminal, `currentPaneOfKind('terminal')` returned
the built-in `Claude` task. Bootstrap therefore reused that task and never created `Terminal`.

[Bootstrap](../../../../src/modules/app/Bootstrap.ts) now lets a kind lookup use one acceptance
predicate. Normal runtime lookups still include task panes. The default-pane path accepts only
panes without task metadata. Both the visible toggle path and the hidden ensure path use that same
predicate.

[The workspace-tabs smoke](../../../../scripts/harness/smoke-workspace-tabs-harness.ts) now reads
task identity from `panelContentIds`. It reads terminal category from `panelContentKinds`. It also
requires the separate `Terminal` label after `Ctrl+J` in each workspace.

[The terminal runtime test](../../../../src/modules/terminal/TerminalPlugin.test.ts) now models a
declared task with kind `terminal` and explicit task metadata. It also proves that runtime shutdown
releases both interactive and task terminal sessions.

## Driving evidence

I first drove a scratch workspace with one `.invar/tasks.json` folder-open shell task. Before the
change, the published task identifier and kind were the same `task:<encoded-root>:0` value. That
was the reported defect.

After the change, the task-owned PTY probe printed the same stable identifier with kind `terminal`.
It saw `TASK_503_READY` from the real shell, found the theme-derived `taskRecord` glyph on screen,
moved the pointer to that cell, clicked it, and observed the exact scratch
`.invar/tasks.json` as the active editor buffer. The probe command is:

```text
bun .invar/tasks/in-progress/503-a-task-is-a-terminal-pane-not-a-kind/503-task-kind-drive.ts
```

The gated smoke repeated the behavior with the shared 10-line and 100,000-line fixtures. On the
first and second boot, each fixture showed one Terminal space, task content kind `terminal`, a task
glyph, and no task-prefixed kind. The saved global order healed to
`["agent","pane-instance-5"]`. Saved task entries stayed absent because TaskLauncher relaunched the
declared task.

For Round 2, a second task-owned PTY probe drove the no-file built-in. Before `Ctrl+J`, it printed
one `task:...:0 / terminal / Claude` pane. After the real key, it printed that pane plus
`pane-instance-1 / terminal / Terminal`, with the interactive terminal active. The probe command
is:

```text
bun .invar/tasks/in-progress/503-a-task-is-a-terminal-pane-not-a-kind/503-built-in-workspace-drive.ts
```

## Positive control

I temporarily restored the old launch defect by assigning the task identifier to `kind`. The
10-line migration arm exited 1 with this failure:

```text
Timed out waiting for the first boot drops dead task panes from their saved Terminal space
```

The planted defect prevented the task from joining the one Terminal space. I removed the plant.
The same smoke then passed at 10 and 100,000 lines on both boots.

For Round 2, I temporarily removed the default-pane predicate from both terminal selection paths.
The updated workspace smoke exited 1 with the filed failure:

```text
Timed out waiting for the first workspace owns its interactive terminal
```

The task pane satisfied the terminal kind lookup, so no separate `Terminal` pane appeared. I
removed the plant. The bare workspace-tabs smoke then reached `ALL-PASS`.

## Verification

- `bunx tsc --noEmit` — PASS.
- `bun test` — PASS: 2,376 tests, 0 failures, and 72,168 expectations.
- `bun scripts/harness/smoke-workspace-tabs-harness.ts` — ALL-PASS. Both workspace roots own one
  built-in task and one separate interactive terminal. Both retain their own process and
  scrollback across round trips.
- `bun scripts/harness/smoke-panel-chrome-harness.ts` — ALL-PASS. This includes both task scale
  fixtures and all existing 120-column and 88-column panel cases.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — PASS: 1,378
  annotations, 266 lattice links, and 0 problems.
- `bash scripts/conventions-gate.sh` — PASS. The core-to-plugin import census remains 0. The core
  vocabulary census remains at its baseline of 33 sites.
- `git diff --check` — PASS.
- Worktree after commit — clean.

I did not run `scripts/merge-gate.sh`. All commit writes used `SKIP_GATE=1`, as required by the
[Round 1 brief](brief-503-1-a-task-is-a-terminal-pane-not-a-kind.md) and the
[Round 2 brief](brief-503-2-2.md).

## Invariants, record by record

### Each task owns one terminal — upheld

The declaration creates one terminal runtime pane and one PTY. Its identifier remains stable. Its
kind is now `terminal`, and its task data is metadata. Unit tests and both driven scale fixtures
cover this shape. This strengthens the record in
[tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md).

### Folder open starts declared tasks — upheld, wording refinement owed

A fresh boot does not restore a process-free task pane. Restore drops the saved task entry, then
TaskLauncher starts the folder-open declaration. The second boot proves the same behavior after
healing. The present behavior still matches
[tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md), but the mechanism now has
a clearer shape.

Proposed follow-up wording:

> A declared task pane is a terminal-kind pane with task metadata. Its
> `task:<encoded-root>:<index>` value is only its stable declaration identifier. A fresh process
> drops the saved task entry, and TaskLauncher starts the declaration again with its metadata.

### Pane identity is separate from presentation — strengthened, scope text misses the new shape

The stable identifier selects the task instance. Kind selects the terminal runtime. Label and task
metadata supply presentation and the source affordance. This makes the invariant true in behavior.
The scope in [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) still excludes “task
runtime kinds.” Such a kind no longer exists. A follow-up refinement should remove that exclusion
and name declaration-derived task identifiers.

### Panel content order is one persisted sequence — upheld

Legacy task entries drop from both the global order and saved workspace groups. The declared task
exists live after TaskLauncher relaunches it, but it does not become a process-free saved
placeholder. The first and second boot observations match the record in
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).

### A persisted pane identity is never reissued — allocator upheld, record distinction owed

The opaque pane allocator still reserves every loaded identity and never issues a saved name to a
different pane. A declared task deliberately derives the same stable identifier from the same
workspace declaration after its dead saved entry is dropped. The current record says only restore
may claim a persisted identity. Its old scope exclusion depended on a task runtime kind. A
follow-up should distinguish opaque allocated identities from declaration-derived task identities:
the allocator must reserve both, while TaskLauncher may reclaim a task identifier only for the
same declaration.

### Panel controls share paint and hit geometry — upheld

The task glyph's width determines one stored half-open range. Painting, hover feedback, tooltip,
and mouse-down all use that range. The driven click used the painted cell. This extends the same
generator described in [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).

### Appearance is data with a capability fallback — upheld

The glyph comes from the active theme's `taskActionIcons.taskRecord` slot. The smoke derives its
expected glyph through the same Nerd, Unicode, and ASCII capability ladder. No host glyph is
hard-coded. This matches
[project.invariants.md](../../../../project.invariants.md).

## Bycatch

- MISSING — [drive.md](../../../../scripts/harness/drive.md) advertises repeatable
  `--env KEY=VALUE`, but [DriveSession](../../../../scripts/harness/DriveSession.ts) does not pass
  those arguments into the PTY environment. I started the warm driver with
  `--env INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS=0`; no declared task appeared. I reproduced it once,
  then used the task-owned PTY probe. Not fixed.
- COMMENT DRIFT — [SourceTextPaneContent](../../../../src/modules/editor/SourceTextPaneContent.ts)
  tells users `Ctrl+P command palette`, while the registered behavior is Quick Open. In the warm
  app, `Ctrl+P` opened Go To File and typed text entered Quick Open. I reproduced it twice. Not
  fixed.
- CONTRACT DRIFT — “Pane identity is separate from presentation” excludes task runtime kinds, but
  task panes now have runtime kind `terminal`. “A persisted pane identity is never reissued” also
  lacks the declaration-derived identifier distinction described above. Both records are in
  [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md). Not fixed; invariant edits were
  outside this task.

No other runtime bycatch was observed.

## Instrument feedback

- EASY — The real PTY driver, graph status waits, screen text search, and mouse input gave one
  observable path from process start through glyph click. The shared scale fixture made the
  10-line and 100,000-line comparison direct.
- CONFUSING — The welcome text calls `Ctrl+P` the command palette, while the driven action is Quick
  Open. This sent the first reproduction down the wrong overlay path.
- MISSING — The documented warm-driver `--env` option does not reach the app environment. A working
  environment pass-through would let `bun run drive` launch folder-open task fixtures without a
  separate PTY script.

## Commit

`20b055e3ab793d3d7516dd7006f5ef42fba128bc` — `Make task panes terminal panes with metadata`
