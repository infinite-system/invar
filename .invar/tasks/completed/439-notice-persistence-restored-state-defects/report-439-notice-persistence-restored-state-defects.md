# READY — notice persistence and restored-state panel defects (#439)

State: READY

Task commit: `3b07fba9e8da39db1e9a14f2c06f11ceba64c1b4`

## Outcome

Notices no longer enter saved panel state. Load sanitation also removes legacy notice panes and
notice identifiers from the saved panel order. A file task that redeclares a built-in label now
suppresses only that label's displacement report.

Restored sessions keep the instances list pinned. Its hover close removes only the selected notice.
The two task terminals remain visible. Database remains in its own space.

The reported cascade had one production cause. Folder-open tasks launched before panel restoration.
Restoration then replaced their live groups with the saved groups. A corrupt Database pane could
therefore appear in Terminal while both task cells disappeared. [Bootstrap](../../../../src/modules/app/Bootstrap.ts)
now restores and sanitizes the panel world before it registers the task contributor. Folder-open
tasks then join the valid restored world.

## Driven evidence

I first repaired and drove the shipped [probe](probe-439-close-displaced-notice.ts). The original
probe could not start because its relative imports resolved inside the task folder. It also clicked
the instances toggle without checking whether restored state had already pinned the list. That click
closed the list. An already-true wait, a fixed delay, stale geometry, and a fallback click on a
neighboring pane then produced the reported pin and close findings.

The corrected probe opens the list only when needed. It uses the shared real gesture for the close:
pointer travel, row hover, the painted close glyph, and a complete press and release. Every wait now
observes the state or grid condition that follows the gesture.

Before the production fix, the copied-settings arm reproduced the cascade. It restored a Database
pane inside a saved Terminal space. Restoration then replaced the task groups, so the task cells
vanished and Database became the Terminal occupant.

After the fix:

- The fresh-settings probe showed two task cells, Terminal and Database spaces, and an initially
  closed list. The probe opened the list through its visible toggle.
- The copied-real-settings probe showed the same two task cells and separate spaces. It kept the
  restored 35-column list pinned.
- The small hermetic task smoke restored a pinned list, hovered the derived Displaced row, clicked
  its close control, and kept both task terminals.
- The exact saved-shape arm dropped a planted notice and a Database-in-Terminal pane. It launched
  the explicit Claude and Terminal tasks as two visible cells.

This covers scale parity for this boot path. The smoke uses a small temporary workspace. The probe
uses the full Invar workspace. Both produced the same two-cell task result.

## Changes

- [Settings](../../../../src/modules/settings/Settings.ts) filters notice identifiers from the saved
  panel order and filters notice panes from every saved workspace state. The same sanitation runs on
  load for existing files.
- [Panel workspace state](../../../../src/modules/ui/PanelWorkspaceState.ts) lets the pane classifier
  reject derived panes during snapshot. Restore also rejects a pane whose kind cannot belong to its
  saved space.
- [Bootstrap](../../../../src/modules/app/Bootstrap.ts) classifies task notices as non-persistent,
  keeps a direct legacy restore guard, and restores the panel world before task registration.
- [Task configuration](../../../../src/modules/tasks/TaskConfiguration.ts) reports only displaced
  built-in labels that the selected file source does not redeclare.
- [HarnessSmoke](../../../../scripts/harness/HarnessSmoke.ts) now owns the shared real gesture for a
  panel-list row close. The [task smoke](../../../../scripts/harness/smoke-tasks-harness.ts) uses that
  helper for restored pin, close, persistence, label override, and cascade coverage.
- Unit coverage locks the save and load filters, label suppression, snapshot exclusion, and
  cross-space restore rejection.

## Invariants in scope

- [Folder open starts declared tasks](../../../../src/modules/tasks/tasks.invariants.md) is
  strengthened. Restoration now finishes before folder-open launch. Notice identifiers cannot
  become restored task terminals.
- [File sources report displaced built-ins](../../../../src/modules/tasks/tasks.invariants.md) is
  refined as approved. Proposed wording: “If a file task source supersedes the built-in source, then
  one visible task report names each built-in label that the file source does not redeclare, while
  the file tasks remain selected.” I did not edit the contract record.
- [Unsupported tasks fail visibly](../../../../src/modules/tasks/tasks.invariants.md) is unchanged.
  Its existing real-path positive-control arm still reports four errors and one warning without
  opening pseudo-terminals.
- [Each workspace owns one panel world](../../../../src/modules/workspace/workspace.invariants.md) is
  upheld. Restore now establishes that world before contributors add live task panes.
- [Panel content order is one persisted sequence](../../../../src/modules/ui/ui.invariants.md) is
  refined. Derived task notices can exist in the live order, but they do not belong to the persisted
  sequence.
- The pinned-list record exists:
  [The panel contents list mirrors open content](../../../../src/modules/ui/ui.invariants.md). The
  restored close smoke now binds this behavior to the user's gesture.

## Positive control

I temporarily disabled notice-identifier recognition in
[Settings](../../../../src/modules/settings/Settings.ts) and removed the legacy notice guard from
[Bootstrap](../../../../src/modules/app/Bootstrap.ts). The planted notice returned as a pane. The
task smoke went red with exit `1` at:

`Timed out waiting for both reported-shape tasks own separate visible split cells`

I removed the plant. The same smoke then passed.

## Verification

One final pass was green:

- Fresh-settings probe: exit `0`.
- Copied-real-settings probe: exit `0`. The probe copied the live file read-only and wrote only to a
  temporary home.
- `bun test`: 2,279 passed, 0 failed, 71,816 expectations across 348 files.
- `bunx tsc --noEmit`: exit `0`.
- `bun scripts/harness/smoke-tasks-harness.ts`: `ALL-PASS`.
- `bun scripts/harness/smoke-panel-split-harness.ts`: `ALL-PASS`.
- Invariant checker: 1,324 annotations and 263 lattice links resolved with 0 problems.
- `bash scripts/conventions-gate.sh`: `PASS`. It reported the existing 20 legacy file-grammar
  violations and no changed-file violations.

The worktree is clean. I committed with `SKIP_GATE=1`. I did not run the merge gate. I did not push
or merge.

## Bycatch

- FIXED IN TASK COMMIT: the shipped [probe](probe-439-close-displaced-notice.ts) had broken relative
  imports and an unconditional toggle, fixed delay, stale-coordinate click, and neighboring-pane
  fallback. Those faults created false pin and close findings. The task required this probe, so its
  repair is part of the task commit.
- OBSERVED: `panelListGeometry` reported `left: -24, top: 0, width: 24` while the restored list
  painted from column 108 and row 25 in a 132-column task-smoke frame. The mismatch reproduced while
  debugging the restored close arm. The gesture helper now anchors to the painted header, but I did
  not change the status geometry generator.
- GENERATOR DRIFT: [AppStatusProjection](../../../../src/modules/app/AppStatusProjection.ts)
  publishes `panelContentIds` from the raw persisted order and `panelContentLabels` from live ordered
  contents. The arrays can differ in length and index when the order contains an unregistered ID.
  The restored smoke reproduced this while its order held unregistered IDs. I avoided pairing these
  arrays in the gesture helper. I did not change the projection in this task.

Contract wording commit: `db47dfdb444d0d26991b7bbf2d3f28c6cd90bf22`
