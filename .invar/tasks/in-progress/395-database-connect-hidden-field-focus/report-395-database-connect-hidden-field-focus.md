# READY — #395 (Database connect hidden-field focus)

State: READY

Branch: `fleet/395-database-connect-hidden-field-focus`

Commit: `db9858f9885cc004ce7b1936e0c8c16fa10f3ff6`

The work in the [task brief](brief-395-2-database-connect-hidden-field-focus.md) is complete. I did
not push the branch or complete the merge gate.

## Result

The reported defect does not reproduce on this branch. #404 (panel two-row chrome and pane-level
add) had already repaired the shared seam in commit `3000e75594c29e52293a7614e1056df60fb48ee0`.
Its [PanelHost](../../../../src/modules/ui/PanelHost.ts) selects the owning content space and split
group before it focuses requested content. I did not manufacture a production-code change.

This task now locks that repair at two levels:

- [PanelHost.test.ts](../../../../src/modules/ui/PanelHost.test.ts) proves that generic
  `showContent` selects the owning Database space and group before it focuses the Database content.
- [smoke-database-harness.ts](../../../../scripts/harness/smoke-database-harness.ts) removes the old
  manual Database-tab click. Its shared connection-input helper now waits for active input, panel
  focus, Database content, the owning space, and a painted Database cell. It also waits for the
  visible `SQLite file path` field.
- After a missing-file error, the smoke moves to Terminal, runs `Database: Connect`, types one
  character, and proves that the visible Database field receives it.
- [project.coverage-deltas.md](../../../../project.coverage-deltas.md) now records the stronger
  contract as 7 assertions and 25 waits.

The earlier [#404 report](../../completed/404-panel-two-row-chrome-and-pane-level-add/report-404-panel-two-row-chrome-and-pane-level-add.md)
records the grouped content-space change that supplied the repair.

## Reproduction and history

I first drove the default app without adding an assertion. I connected to a missing path, moved to
Terminal, returned focus to the editor, and ran `Database: Connect` from the Command Palette. The
final status was:

- `databasePathInputActive=true`
- `panelActiveContent="database"`
- `panelActiveSpace="database-space-1"`
- `panelActiveSpacePaneIds=["database"]`
- `panelCellIds=["database"]`
- `panelFocused=true`

The `SQLite file path` field was visible. The defect was absent.

History explains why. Commit `9ac75e4b1` for #346 (workspace panel content-space tabs) routed the
Database command through `bottomPanelHost.showContent('database')`. Its smoke still clicked the
Database tab when the command focused an input in another active space. Commit `3000e7559` for
#404 (panel two-row chrome and pane-level add) later changed `showContent` to select the owning
space and group first. The old smoke workaround remained and hid that repair from regression
coverage.

## Shared-seam beneficiaries

The structural census found 35 `showContent` identifier sites, including tests. The generic seam
serves all three pane hosts. The direct bottom-panel beneficiaries are:

- `Database: Connect`, `Database: Reconnect`, and `View: Show Database`.
- Terminal and Agent toggles when their content space is inactive.
- Runtime-pane open requests and the panel Add action.
- Agent terminal-tool reveals.
- Panel-list selection through `activateOpenContent`.

The File Explorer, Git, and Extensions commands use the same focus-and-paint seam in the primary
dock. Contributed dock actions use it through `ApplicationContributions.show`. They do not use the
Database content space, but they inherit the same rule that requested content becomes the painted,
focused content. No consumer needs a Database-specific reveal path.

## Driven evidence

- The focused Database smoke passed through real connect, schema browsing, three bounded pages,
  reconnect, disconnect, and a missing-file error. It then passed the new content-space focus arm.
- The shared 10-line fixture ended with the missing-file error stated, active path input, active
  Database content, `database-space-1`, Database in the active-space pane list, and Database in the
  painted cell list.
- The shared 100,000-line fixture produced the same fingerprint. Both drives exited 0.
- The new input-routing arm typed one character after the content-space switch. The published path
  grew by exactly one character.

## Positive control

I temporarily removed owning-space selection from `PanelHost.showContent`. The Database smoke
exited 1 with:

`Timed out waiting for the Database content space is active after disconnect`

The planted defect left the active identifier and painted content space inconsistent. I restored
the seam before the final pass. I did not widen any timeout.

## Invariant audit

The exact records in scope are below.

- [Seams are drawn at the shared generator](../../../../project.invariants.md#seams-are-drawn-at-the-shared-generator)
  is strengthened. Database keeps using `PanelHost.showContent`. The task adds no one-off tab or
  selection branch.
- [Plugin panes use the shared pane and popup hosts](../../../../src/modules/ui/ui.invariants.md#plugin-panes-use-the-shared-pane-and-popup-hosts)
  is upheld. The Database pane stays an opaque `PaneContent` consumer.
- [The panel renders exactly the visible pane content cells each frame](../../../../src/modules/ui/ui.invariants.md#the-panel-renders-exactly-the-visible-pane-content-cells-each-frame)
  is strengthened. The driven contract requires Database in `panelCellIds` and requires its path
  field on the terminal grid.
- [A focused panel routes keystrokes to its active pane content](../../../../src/modules/ui/ui.invariants.md#a-focused-panel-routes-keystrokes-to-its-active-pane-content)
  is strengthened. One typed character must reach the visible path field after the space switch.
- [A focused split panel routes keystrokes to the focused cell](../../../../src/modules/ui/ui.invariants.md#a-focused-split-panel-routes-keystrokes-to-the-focused-cell)
  is upheld. The generic unit test checks the selected group and focused content. It adds no second
  key-routing path.
- [One panel host owns keyboard focus](../../../../src/modules/ui/ui.invariants.md#one-panel-host-owns-keyboard-focus)
  is strengthened. The compound status wait requires `panelFocused=true` with Database active and
  painted.
- [Panel content order is one persisted sequence](../../../../src/modules/ui/ui.invariants.md#panel-content-order-is-one-persisted-sequence)
  is upheld. `showContent` selects the existing owning space and group. It does not rewrite order.
- [The active activity item determines its dock content](../../../../src/modules/ui/ui.invariants.md#the-active-activity-item-determines-its-dock-content)
  is not changed. Bottom-panel content spaces do not use an activity item.
- [Editable text fields share one input model](../../../../src/modules/ui/ui.invariants.md#editable-text-fields-share-one-input-model)
  is upheld. The smoke drives the existing shared text field and its normal key route.
- [Database files are user selected](../../../../src/modules/database/database.invariants.md#database-files-are-user-selected)
  is strengthened. The user-selected path must be visible while it owns input.
- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md#harness-waits-observe-conditions-not-frame-ordinals)
  is upheld. The new waits observe published space, cell, focus, value, and grid conditions. They use
  no frame number or fixed sleep.

No invariant needed a downgrade. The existing records and their lattice conjunction cover the
focus-implies-visible behavior. No shadow invariant or new record was needed.

## Verification

- `bun run typecheck` — exit 0.
- `bun test src/modules/ui/PanelHost.test.ts` — 27 passed, 0 failed, 134 assertions.
- `bun scripts/harness/smoke-database-harness.ts` — all 7 PASS lines, exit 0.
- Small and large `bun run drive` probes — both exited 0 with the same final content-space
  fingerprint.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all` — exit 0.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs` — 1,313 annotations and 263
  lattice links resolved, with 0 problems.
- `bun scripts/check-coverage-ratchet.ts` — 392 files inspected, with no undeclared decrease.
- `bunx prettier --check` on all three changed files — exit 0.
- `git show --check HEAD` — exit 0.
- The worktree is clean.

The first commit attempt started the repository merge gate through the default pre-commit hook. It
reported the stale coverage-ledger row. I stopped the hook when it entered behavioral contracts,
updated the row, ran the focused coverage ratchet, and committed with the hook's documented
`SKIP_GATE=1` path. The conductor still owns the complete merge gate.

## Bycatch

- The task brief says not to run the merge gate, but the default
  [pre-commit hook](../../../../.git/hooks/pre-commit) starts it for every commit. It auto-started on
  the first commit attempt and reached behavioral contracts before I stopped its process group. I
  did not change the hook because workflow policy is outside this task.
- The invariant reference checker reports that
  [Hierarchical pane rows share one compact indent](../../../../src/modules/ui/ui.lattice.md#hierarchical-pane-rows-share-one-compact-indent)
  has no reference. The baseline check and the final check both reproduced this existing UI lattice
  coverage note. I did not change it.
