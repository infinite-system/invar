# READY — hidden unsupported structure drives settle

Task: #279 (drive settlement for hidden unsupported structure)

Status: READY

Commit: `dc5d99d3 Settle hidden unsupported structure drives`

## Result

[Drive.ts](../../../../scripts/harness/Drive.ts) now treats hidden
`structureStatus="no-document"` as a completed decline. A visible Structure
projection still holds settlement until its first refresh starts. Any
`structureStatus="loading"` state still holds settlement, even if the pane
becomes hidden during the request.

The rule checks both dock hosts. It recognizes Structure in the visible
primary dock or the visible right dock. No timeout changed.

[Drive.test.ts](../../../../scripts/harness/Drive.test.ts) locks both
polarities. The hidden unsupported state settles. Visible `no-document` and
all `loading` states remain pending.

[harness.invariants.md](../../../../scripts/harness/harness.invariants.md#drive-settled-observations-include-declared-debounced-work)
now states the observed-work boundary. This refines the settled-status record
without weakening its pending-work guarantee.

The change upholds
[A structure source answers or declines, never blanks](../../../../src/modules/structure/structure.invariants.md#a-structure-source-answers-or-declines-never-blanks).
An unsupported file can decline by keeping the default-hidden pane
unobserved. The outline issues no request in that state.

## Reproduction

Before the change, the default 100,000-line drive failed at both requested
deadlines.

```text
$ bun run drive --size 100000
drive: Timed out waiting for grid condition: the application and the drive quiescence registry to settle
...
structureStatus="no-document"
rightDockVisible=false
```

The 15-second run exited 1 after painting the complete editor frame.

```text
$ bun scripts/harness/Drive.ts --size 100000 --timeout 30000
drive: Timed out waiting for grid condition: the application and the drive quiescence registry to settle
```

The 30-second run also exited 1 with the same complete frame. The default
10-line drive produced the same timeout and state.

## Driven evidence

After the change, both unsupported scale fixtures settled immediately.

- `bun run drive --size 10` exited 0. It published
  `structureStatus="no-document"`, `structureRequests=0`, and
  `rightDockVisible=false`.
- `bun run drive --size 100000` exited 0 with the same three-value
  fingerprint.
- Driving [README.md](../../../../README.md) with `bun run drive --open`
  exited 0 with
  `structureStatus="ready"`, `structureRequests=1`, and four structure rows.
- Driving
  [project.conductor.archive.md](../../../../project.conductor.archive.md)
  with `bun run drive --open` exited 0 with
  `structureStatus="ready"`, `structureRequests=1`, and 110 structure rows.

The small and large unsupported files now have the same settlement shape.
The supported Markdown files still wait for their real outline answer.

## Positive control

I temporarily removed the `loading` hold, then ran
`bun test scripts/harness/Drive.test.ts`.

The unit polarity failed with this exact difference:

```text
Expected: ["structureStatus has not refreshed the active file"]
Received: []
```

The real PTY arm also failed. It printed `Parsing Markdown…` and
`No file is open.` before the asynchronous work finished. I removed the
plant before the green run.

## Settings family member

The earlier
[#278 (dock-agnostic activity surface) report](../../completed/278-activity-bar-dock-agnostic-side-setting/report-278-activity-bar-dock-agnostic-side-setting.md)
records one exact miss. It observed `settingsOpen=true` before
`Mirror activity bar on right` painted, so its text click missed.

I ran this follow-up twice:

```text
bun run drive --open README.md \
  --key 'Control+,' --wait-for-status 'settingsOpen=true' \
  --click 'text=Workspace tabs'
```

Both runs resolved `Workspace tabs` at cell `10,23` and selected it. The miss
did not reproduce in these follow-up runs.

This is a separate generator. Boot settlement evaluates
`$settledStatusRules`, but action status completion uses
`awaitStatusWithoutFrame`. The structure registry fix cannot make an
interactable status wait for its painted target. This needs a separate task
for state-and-paint action completion.

## Verification

- `bun test`: 1,922 passed, 0 failed, 68,606 expectations in 295 files.
- `bun run typecheck`: passed.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`:
  0 problems, 1,127 annotations, and 221 lattice links.
- `bash scripts/conventions-gate.sh`: passed.
- The pre-commit merge gate passed.
- All 62 parallel PTY smokes passed.
- Behavioral contracts passed.
- All three serial PTY smokes passed.
- The five-session input-byte ordering gate passed.
- The gate reported no retry-only pass.
- `git diff --check`: passed.
- The worktree is clean after commit.

## Bycatch

- The ignored root task-brief copy linked to the structure contract as if it
  still lived in the task folder. The invariant checker reported the bad
  relative path. I corrected this ignored local task input so the checker
  could inspect the worktree. No tracked source changed.
- The Settings state-and-paint race is the separate generator described
  above. The prior task reproduced it once. This task's two follow-up drives
  did not reproduce it.
