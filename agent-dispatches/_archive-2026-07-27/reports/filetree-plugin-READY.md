# File-tree plugin — READY report

## Reduction recorded before refactoring

### 1. Contributor or host furniture

The file tree is a contributor. Document opening is host furniture.

The structural split already exists in the user paths: Quick Open, navigation
history, language-definition jumps, rendered file references, and editor tabs
all open or restore documents without consulting the tree. Their shared
generator is the host-owned document/tab lifecycle (`Workspace.openFileInTab`,
`OpenBufferSet`, `DocumentLifecycle`). The tree instead generates a lazy,
windowed hierarchy and turns one selected leaf into a call to that host
capability.

Therefore the plugin owns file discovery, tree state, rendering, focus,
scrolling, and tree commands. The host keeps path confinement and generic
document opening. With no plugins, the canvas has no file-tree sidebar, but it
still has its editor/document lifecycle and Quick Open path. This makes the
zero-plugin canvas claim literal without copying document opening into the
plugin.

### 2. Missing capability

No new one-customer application port is needed. The existing application
context already supplies the renderer, workspace set, settings, theme,
commands, dock host, status projection contributions, render request, and
`registerPrimaryDockContent`.

Two existing many-customer contracts need narrow fields:

- `ApplicationPlugin` needs a way for a plugin to nominate its registered
  primary-dock content as the initial fallback. Without this, the host would
  have to name `files` or guess that the first registered plugin is the
  default.
- `PaneContent` needs optional generic horizontal-scroll projection alongside
  its existing vertical-scroll projection. The shared scrollbar controller
  can then drive any dock content without asking whether it is the file tree.

Both are fields on established contracts, not new ports.

### 3. Sidebar contribution port

No new sidebar contribution port is needed.
`registerPrimaryDockContent` already accepts the file tree unchanged as a
`PaneContent`; `PanelHost`, `Sidebar`, and `ActivityBar` already render and
route registered contents generically.

## Implementation and verification

### What moved

The file tree is now a default `ApplicationPlugin` and `WorkspacePlugin` in
`src/modules/filetree/`:

- `FileTreePlugin` registers the Files primary-dock contribution, nominates it
  as the primary-dock fallback, installs the file-tree commands and status
  projection, and owns the per-workspace lifecycle.
- `FileTreeWorkspace` owns tree discovery/state and both momentum lanes. A
  selected leaf crosses the boundary through the generic
  `Workspace.openFileInTab` capability and then focuses the editor.
- `FileTreePaneContent`, `TreePaneRenderer`, and `FileTree` moved behind that
  plugin boundary with their tests.
- `filetree.invariants.md` now owns the lazy-discovery/windowing contract that
  previously lived in the workspace contract.

`DefaultPlugins` installs `FileTreePlugin` first, so the shipped experience is
unchanged while a zero-plugin canvas has no Files contribution.

### What stayed host-owned

The host still owns workspaces, open buffers, document lifecycle, tabs, generic
editor focus, the primary-dock host, activity-bar/sidebar routing, generic
vertical and horizontal scrollbar synchronization, Quick Open, and
`Workspace.openFileInTab`.

The host no longer imports, constructs, stores, renders, scrolls, dispatches
commands for, or projects status from `FileTree`. `Bootstrap`, `Workspace`,
`ScrollbarSync`, and the core status projection operate only on generic
plugin/dock contracts.

### Contract changes

- `ApplicationPlugin.primaryDockFallbackContentIdentifier` is an optional
  declaration on the existing plugin contract. Bootstrap selects the first
  declared installed fallback without naming Files.
- `PaneContent` gained optional generic horizontal-scroll projection and
  control members. Its render revision accepts a readonly ref of an unknown
  revision token, permitting a collision-free composite tree/viewport token
  while preserving all existing numeric revisions.

No new application port or sidebar contribution port was added.

### Boundary evidence

- The structural identifier census finds every `FileTree` reference under
  `src/modules/filetree/`; host app/workspace/UI modules contain none.
- The only intentionally retained file-tree command identifiers outside the
  plugin are declarative keybinding data: 9 entries in
  `KeybindingDefaults.ts` and 1 in `KeybindingRegistry.ts`.
- `scripts/conventions-gate.sh` enforces that baseline with zero tolerance for
  app/workspace references and passes.
- The activity-bar harness now proves that Explorer is contributed by the
  default plugin manifest rather than duplicated by host furniture.
- `git ls-files | grep '^TASK'` returns no paths.

### Re-measured obligations

Activation was driven through the workspace harness:

- Tiny fixture (5 watched directories): 2 queries, 5 watched directories.
- Wide 500-directory fixture: 2 queries, 522 watched paths including the root
  and fixture scaffolding.

The query count is therefore 2 in both cases. The multi-workspace drive also
confirmed one active watcher, a held paint barrier until activation completed,
and restored tree/Git views while switching workspaces.

A synchronous `WorkspaceSet` switch measurement with two real temporary
workspaces and the installed file-tree plugin performed 30,000 switches:

- median: 0.000604083 ms
- p95: 0.00072225 ms
- maximum: 0.000886583 ms

The synchronous switch remains sub-millisecond.

### Driven-path evidence

The PTY/emulator paths were driven from the real UI:

- Activity bar: 3/3 runs passed. Explorer appeared from the plugin manifest,
  painted its tree, and switched correctly by click and focus chord.
- Navigation history: 3/3 runs passed. The driver opened `alpha` from the tree
  with Enter, verified its contents in the emulator grid, returned to the tree,
  moved down, opened `beta`, and verified the second document in the grid.
- Workspace tabs: 3/3 runs passed. A workspace was added through the real
  picker, workspace switches restored tree and Git views, the paint barrier
  stayed closed until the watcher completed, and only one watcher remained
  active.
- The navigation and workspace-tab paths each passed once more while two
  deliberate CPU burners loaded the machine.

The final behavioral-contract drive passed momentum/glide behavior for editor,
tree, and wrapped content; idle quiescence (`frame 2 -> 2` over three seconds);
open-then-scroll true first/last lines; focus recovery; and pane independence.

### Coverage movement

`project.coverage-deltas.md` appends the moved-file declarations and the
activity-bar harness movement using the checker-required counted grammar.
The final ratchet inspected 289 files with no undeclared decrease. The unit
suite reports 1,532 passing tests, 0 failures, and 16,884 assertions.

### Exact final exit codes

These were rerun against committed bytes after the pre-commit formatter:

- `bunx tsc --noEmit`: 0
- `bun test`: 0
- `bun scripts/check-file-grammar.ts`: 0
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: 0
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: 0
  (802 annotations and 45 lattice links resolved, 0 problems)
- `bash scripts/conventions-gate.sh`: 0
- `bun scripts/check-coverage-ratchet.ts`: 0
- `bash scripts/behavioral-contracts.sh`: 0
- `git diff --check`: 0

Commit: `71e6f05` (`feat(filetree): extract explorer into default plugin`)

### Known unfixed defects

None found.

## Post-main merge — contributor taxonomy adoption

Commit: `ce0d7762b1b034f80bf798d42ea4907c58d1da26`
(`Merge main and adopt contributor taxonomy`)

### Merge conflicts resolved by hand

1. `project.canvas-census.md` — retained the completed file-tree extraction and zero-coupling
   figures while adopting main's owner decision that language is a provider plugin with a separate,
   ready extraction.
2. `project.invariants.md` — retained the file-tree evidence for *The host canvas is complete
   without plugins* while adopting main's contributor terminology, language decision, and
   *Plugin boundaries grant one authority* record.
3. `src/modules/app/ApplicationContributor.interface.ts` — combined main's explicit optional
   `workspaceContributor` port with the file-tree branch's
   `primaryDockFallbackContentIdentifier` field on the renamed application contract.
4. `src/modules/plugins/DefaultPlugins.test.ts` — retained the Files contribution and added main's
   explicit workspace-participation assertions. The shipped contributor sequence now reports
   `[true, true, true, false]` for file tree, Git, Markdown, and Extensions.
5. `src/modules/plugins/DefaultPlugins.ts` — retained the file tree in the default composition
   while adopting `ApplicationContributor` and the renamed file-tree class.

### Taxonomy decisions

- `FileTreePlugin` became `FileTreeContributor`, and the implementation and test filenames follow
  the class. The class pushes pane, command, and status registrations and attaches lifecycle state;
  it neither answers provider queries nor exchanges a hosted runtime stream, so `Contributor` is
  the honest boundary kind.
- `FileTreeContributor` implements `ApplicationContributor` and `WorkspaceContributor`, then opts
  into the narrower lifecycle explicitly with
  `readonly workspaceContributor: WorkspaceContributor = this`. It does not regain the removed
  application-to-workspace inheritance.
- `primaryDockFallbackContentIdentifier` now lives on
  `ApplicationContributor`; the file tree continues to nominate `files` without host-core knowledge
  of the domain.
- `FileTreePaneContent` and `FileTreeWorkspace` consume
  `ApplicationContributionContext` and `WorkspaceContribution` from the renamed contracts.
- `grep -rn "ApplicationPlugin\|WorkspacePlugin" src scripts` produced no output and exited `1`, as
  expected for a bare-name sweep with no matches. The structural AST census also found zero old-name
  identifiers.

### Post-commit live drives and measurements

The exact committed bytes were driven three times through both real PTY paths:

- `smoke-navigation-history-harness.ts`: 3/3 ALL-PASS — booted the workspace, navigated the tree,
  opened `alpha.ts` and `beta.ts`, and verified their contents in the emulator grid.
- `smoke-workspace-tabs-harness.ts`: 3/3 ALL-PASS — added a second workspace through the real picker,
  switched both directions, restored tree/Git views, preserved the activation paint barrier, and
  retained exactly one live watcher.
- Every run measured the same activation figures:
  - tiny fixture: `2` queries, `5` watched paths;
  - nominal 500-directory wide fixture: `2` queries, `522` watched paths including root and fixture
    scaffolding.
- The 2-query bound therefore held in all three paired measurements.
- `smoke-selection-harness.ts`: ALL-PASS using `Ctrl+Shift+J` for host side-dock focus; Tab remains
  editor-owned for indentation.

### Exact post-commit exit codes

- `bun install --frozen-lockfile`: `0` (152 installs checked, no changes)
- `bunx tsc --noEmit`: `0`
- `bun test`: `0` (1,532 pass, 0 fail, 16,888 assertions)
- `bun scripts/check-file-grammar.ts`: `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: `0`
  (808 annotations and 45 lattice links resolved, 0 problems)
- `bash scripts/conventions-gate.sh`: `0`
- `bun scripts/check-coverage-ratchet.ts`: `0`
- `bash scripts/behavioral-contracts.sh`: `0`
- `git diff --check`: `0`

The post-integration semantic review upheld the host-canvas, file-tree cost, pane-content citizen,
and one-authority plugin-boundary invariants with no downgrade or unresolved finding. The branch is
clean after the commit and all post-commit verification.

## Gutter-diff landing regression fix

Commit: `2f28f53fd3f8aa1e22ba013671ddcd9be53adccd`
(`Fix primary dock focus projection`)

### Measured mechanism and commit-to-failure chain

The gutter decoration pipeline was healthy. The failing terminal frame painted a modified gutter
bar for `addedlineafter switch`, proving that the text mutation and decoration subscription both
ran; the text had reached the wrong document.

The focus state had split into two authorities after the second file-tree click:

- `Workspace.focus` was `editor`.
- `PanelHost.focused` for the primary dock was still `true`.

The sidebar click synchronously moved workspace focus
`editor → primaryPane → editor`. The default queued Vue watcher coalesced that round trip back to
its starting value and did not run, so it never blurred the primary dock.

That stale dock bit existed at pre-filetree main `80a1559`, but the old file-tree pane had no
`keybindingContext`; the primary-dock router therefore could not resolve `Enter` as a tree action,
and the gutter smoke passed there with exit `0`. Commit `71e6f05` extracted the tree into
`FileTreePaneContent` and added `keybindingContext: 'files'` so plugin-owned tree bindings could be
routed. This exposed the stale focus state: after the reconciliation wait, `End` fell through, but
`Enter` resolved as `tree.activate`, opened the still-selected `switched-modified.txt`, and the
following text edited that file instead of appending a line to `tracked.txt`. Merge commit
`ce0d776` retained that behavior.

The external HEAD reconciliation was only the last successful wait before the bad input; it did not
cause the defect.

### Fix

The workspace-focus-to-primary-dock projection in `Bootstrap` now uses `{ flush: 'sync' }`.
Focus transfer is input ownership, so every intermediate transition must be observed rather than
deferred. The watcher now focuses the dock on `primaryPane` and immediately blurs it again when the
same pointer action opens a file and returns focus to `editor`; the primary dock cannot intercept the
next editor key.

The existing added-line assertion was not changed.

### Exact exit codes

- Committed-tip reproduction before the fix: `bun scripts/harness/smoke-gutter-diff-harness.ts`:
  `1`
- Pre-filetree comparison at `80a1559`, run from that worktree: `0`
- Final gutter-diff smoke run 1: `0`
- Final gutter-diff smoke run 2: `0`
- Final gutter-diff smoke run 3: `0`
- `bunx tsc --noEmit`: `0`
- `bun test`: `0` (1,532 pass, 0 fail, 16,888 assertions)
- `bash scripts/behavioral-contracts.sh`: `0`
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: `0`
  (808 annotations and 45 lattice links resolved, 0 problems)
- `bash scripts/conventions-gate.sh`: `0`
- `git diff --check`: `0`
