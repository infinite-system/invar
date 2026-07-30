# READY — #340 (file tree reveals the open file)

State: READY

Commit: `84f0efa8` (`Reveal open files in the file tree`)

## Result

Opening a visible workspace file now reveals it in the file tree by default. The tree expands its
ancestors, selects its row, stops live vertical motion, and uses the existing minimum-scroll path.
The one active-document event in
[Workspace.ts](../../../../src/modules/workspace/Workspace.ts) serves tree clicks, Quick Open,
goto-definition, palette opens, and tab activation. Automatic reveal does not change editor focus.

[FileTreeContributor.ts](../../../../src/modules/filetree/FileTreeContributor.ts) registers
`fileTreeRevealOpenFile` as a contributed Boolean setting. Its default is `true`. The Settings panel
shows `Reveal open file`. A user value of `false` suppresses automatic reveal.

The Files pane now has a right-aligned header-button row. Its first button is the circled-dot reveal
action. The shared projection in
[FileTreeHeaderRow.ts](../../../../src/modules/filetree/FileTreeHeaderRow.ts) owns its paint, tooltip,
hover, and half-open hit columns. Later add-file and add-folder controls can join the same button
array.

A filtered dotfile is an explicit safe no-op. The file still opens. The reveal does not expand a
hidden ancestor, change selection, or change scroll.

## Drive evidence

Before the change, Quick Open activated `src/main.ts` while `src` stayed collapsed. The file-tree
status stayed at `treeSelected=0` and `treeScrollTop=0`.

After the change:

- Quick Open expanded the target ancestors, selected `target.ts`, scrolled it into view, and left
  `focus=editor`.
- A separate user-settings session with `fileTreeRevealOpenFile=false` opened the same target while
  the tree stayed collapsed at `treeRows=61`, `treeSelected=0`, and `treeScrollTop=0`.
- Clicking the circled-dot button in that session revealed the current file and returned focus to
  the editor.
- The same drive passed with 60 and 2,000 branch directories. The large run materialized only the
  2,000 branch rows and the target row.
- The goto-definition drive still reached the declaration through the same active-document seam.

The durable drive is
[smoke-tree-scroll-harness.ts](../../../../scripts/harness/smoke-tree-scroll-harness.ts). It creates
bounded temporary fixtures and removes them after each run. It does not commit a large fixture.

## Positive controls

Each planted defect made its check red. I removed every plant before the clean pass.

- Disabled the active-document hook:
  `Timed out waiting for Quick Open activates and reveals the nested target`.
- Removed the setting gate:
  `Timed out waiting for the target activates while the setting keeps the tree collapsed`.
- Disabled the button action:
  `Timed out waiting for the reveal button selects and scrolls to the active file`.
- Made hit ranges include their end column:
  `paint and hit testing use the same right-aligned button segments` failed.
- Let a filtered hidden path mutate expansion:
  `revealing a filtered hidden file is a safe no-op` failed.
- Changed the contributed default to `false`:
  `registers the default-on reveal setting in the file-tree schema` failed.
- Removed the pane tooltip result:
  `publishes pane identity and preserves pointer activation` failed.
- Removed minimum scroll:
  `revealing a path expands ancestors, selects the file, and minimally scrolls` failed.

## Verification

- `bun test src/modules/filetree src/modules/theme/ThemeIcons.test.ts
  src/modules/workspace/Workspace.test.ts`: 57 passed, 0 failed, 483 expectations.
- `bun scripts/harness/smoke-tree-scroll-harness.ts`: all passed at 60 branches.
- `INVAR_FILE_TREE_SCALE_BRANCH_COUNT=2000 bun
  scripts/harness/smoke-tree-scroll-harness.ts`: all passed at 2,000 branches.
- `bun scripts/harness/smoke-goto-definition-harness.ts`: all passed.
- `bunx tsc --noEmit`: `TSC=0`.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: 1,216 annotations,
  223 lattice links, 0 problems.
- `bun run check`: conventions gate passed.
- `git diff --check`: passed.

The first commit attempt started the full merge gate through the repository pre-commit hook. I did
not invoke that gate. The task brief explicitly says not to run it. The hook blocked the commit
because the plugin-manifest behavioral drive timed out twice while selecting the first Git setting.
The exact failures are in the
[first attempt log](/tmp/merge-gate-failures.4015829/behavioral-contracts-felt-invariants-.attempt1.log)
and [retry log](/tmp/merge-gate-failures.4015829/behavioral-contracts-felt-invariants-.log). The
task-specific tree, Quick Open, layout, selection, and goto-definition smokes all passed in that
hook. I then used the hook's documented `SKIP_GATE=1` path, as required by the brief's no-gate
order, and committed the already formatted and staged change.

## Invariant audit

- [The file tree costs only what is expanded and visible](../../../../src/modules/filetree/filetree.invariants.md#the-file-tree-costs-only-what-is-expanded-and-visible):
  upheld. Reveal expands ancestor directories only and recomputes once. The 2,000-branch drive
  confirmed the bounded row count.
- [The tree reveal follows the active file](../../../../src/modules/filetree/filetree.invariants.md#the-tree-reveal-follows-the-active-file):
  added as provisional and upheld by the hook, setting, hidden-file, focus, and scale checks.
- [File tree controls share paint and hit geometry](../../../../src/modules/filetree/filetree.invariants.md#file-tree-controls-share-paint-and-hit-geometry):
  added as provisional and upheld. One projection supplies paint, tooltip, hover, and clicks.
- [One generator owns each scroll position](../../../../src/modules/ui/scroll.invariants.md#one-generator-owns-each-scroll-position):
  upheld. Reveal halts vertical momentum before the existing tree scroll authority writes.
- [Plugin settings live in contributed schema](../../../../src/modules/settings/settings.invariants.md#plugin-settings-live-in-contributed-schema):
  upheld. The file-tree contributor owns the descriptor and value ref.
- [Every setting is a reactive cell read through its value ref](../../../../src/modules/settings/settings.invariants.md#every-setting-is-a-reactive-cell-read-through-its-value-ref):
  upheld. `FileTreeWorkspace` reads the registered ref at each active-document event.
- [Values layer defaults then user then project in that precedence](../../../../src/modules/settings/settings.invariants.md#values-layer-defaults-then-user-then-project-in-that-precedence):
  upheld. The default-on session and user-level false session both passed.
- [A tooltip never intercepts input](../../../../src/modules/ui/ui.invariants.md#a-tooltip-never-intercepts-input):
  upheld. The pane supplies only tooltip text to the existing display-only host.
- [The file tree is a pane content citizen](../../../../src/modules/ui/ui.invariants.md#the-file-tree-is-a-pane-content-citizen):
  upheld. The header row stays inside the existing pane content seam.
- [Selection stays anchored to an item](../../../../src/modules/ui/ui.invariants.md#selection-stays-anchored-to-an-item):
  the brief missed this record. Its old wording said only clicks and keyboard movement could change
  selection, which contradicted the requested active-file reveal. I refined the record and its
  lattice link to include the active workspace file as an item-targeted selection authority.

## Bycatch

- The automatic pre-commit gate saw the plugin-manifest drive time out twice while it waited for the
  first Git setting to become selected. Both attempts reproduced the same condition. I did not
  change that unrelated path.
- The same automatic gate saw the panel-split smoke time out once while it waited for
  `agent,terminal` content order. Its quiet retry passed, so it did not reproduce a second time. The
  [first-attempt log](/tmp/merge-gate-failures.4015829/smoke-panel-split-harness-.attempt1.log)
  preserves the observation. I did not change that unrelated path.
- The scoped invariant list omitted
  [Selection stays anchored to an item](../../../../src/modules/ui/ui.invariants.md#selection-stays-anchored-to-an-item).
  The record's exclusive writer list conflicted with this task. The invariant audit above records
  the required refinement.
