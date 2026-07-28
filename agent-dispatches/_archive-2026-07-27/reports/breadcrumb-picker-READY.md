# Breadcrumb segment picker — READY

Branch: `feat-breadcrumb-picker`

Commit: `d87c338` (`feat: add breadcrumb segment picker`)

## Design decision

The shared generator remains `BoundedListPopup`. Hierarchical behavior was added there as generic
capability:

- `BoundedListPopupItem.keepOpenOnSelect` keeps an activation open.
- `BoundedListPopupItem.drillable` makes Right activate only container-like items.
- `navigateBackwardHandler` gives Left a consumer-supplied parent action.
- `replaceItems` can atomically reset query and viewport, update title, and preselect an item.
- Enter and pointer activation still use the same activation chokepoint; ordinary consumers keep
  their existing dismiss-on-select behavior by default.

`BreadcrumbPicker` is only an adapter: it maps `Files.list` entries into popup items, keeps the
current directory inside the workspace root, re-roots on directory activation, and calls
`Workspace.openFileInTab` for a file. It owns no popup geometry, filtering, selection wrapping,
query editing, pointer behavior, or dismissal rules.

The breadcrumb renderer now returns the exact segment ranges it painted. `TabBar` uses those same
ranges for click and hover hit-testing and paints hover with the existing `palette.cursorLine`
affordance.

`BoundedListPopup.query` now composes `TextInputModel`; the last report-only text-input census result
is gone. `scripts/conventions-gate.sh` now enforces a zero-result census.

## Files

- Shared popup and query seam: `src/modules/ui/BoundedListPopup.ts`
- Breadcrumb projection, hit geometry, hover, and adapter:
  `src/modules/ui/Breadcrumb.ts`, `src/modules/ui/BreadcrumbPicker.ts`,
  `src/modules/ui/TabBar.ts`, `src/modules/ui/TabBarRenderer.ts`,
  `src/modules/ui/RootView.ts`
- Keyboard routing: `src/modules/keybindings/KeybindingDefaults.ts`,
  `src/modules/app/Bootstrap.ts`
- Unit and driven coverage: `src/modules/ui/Breadcrumb.test.ts`,
  `src/modules/ui/BreadcrumbPicker.test.ts`,
  `scripts/harness/smoke-bounded-list-popup-harness.ts`
- Contract and census enforcement: `src/modules/ui/ui.invariants.md`,
  `project.invariants.md`, `scripts/ast-query.ts`, `scripts/conventions-gate.sh`

## Driven evidence

`bun scripts/harness/smoke-bounded-list-popup-harness.ts`

- Exit code: 0
- Assertions: 27 PASS
- Drove a real breadcrumb segment click through `PtyTestDriver`.
- Compared observed cell attributes for the hovered segment and an unhovered control segment in the
  same frame.
- Asserted source-level directory and file rows from emulator cells.
- Asserted the current child directory was preselected by its observed row attributes.
- Typed a live query and asserted the filtered emulator cells.
- Enter drilled in and reset the query without dismissal.
- Left returned to the parent and reselected the child.
- Right drilled into that selected child without dismissal.
- Enter opened a real file, dismissed the popup, and the emulator grid showed
  `BREADCRUMB PICKER FILE CONTENT`.
- Existing outside-click dismissal was already present through the popup backdrop; it was reused,
  not reimplemented, and the same harness verifies it.

Shared-popup companion harnesses: 6 of 6 passed, each exit code 0:

- `smoke-completion-harness.ts`
- `smoke-layout-harness.ts`
- `smoke-panel-chrome-harness.ts`
- `smoke-tabs-harness.ts`
- `smoke-mode-coherence-harness.ts`
- `smoke-overlay-dialog-harness.ts`

## Required checks

- `bunx tsc --noEmit`: exit 0
- `bun test`: exit 0; 1,330 pass, 0 fail, 15,728 expectations across 203 files
- `bun scripts/check-file-grammar.ts`: exit 0; 385 TypeScript files, 0 violations,
  23 enforced converted modules, 6 interface test-pair exemptions
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: exit 0;
  22 contracts passed, 672 annotations resolved, 41 lattice links resolved, 0 problems
- `bash scripts/conventions-gate.sh`: exit 0; text-input census 0 matches
- `git diff --check`: exit 0

## Limits and handoff notes

- No behavior requested by this task remains unproved.
- The full merge gate was not run, as instructed.
- No push, merge, tag, branch deletion, or worktree operation was performed.
- `origin/main` advanced during the work; the committed branch is currently ahead 1 and behind 4.
  The conductor should perform its normal integration procedure.
- The untracked `TASK.md` packet was removed after commit so the worktree could be left clean; it was
  never staged or tracked.
