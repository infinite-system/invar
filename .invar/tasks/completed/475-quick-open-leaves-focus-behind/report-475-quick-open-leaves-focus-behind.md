## In plain words

Quick Open opened a file but left the keyboard in the Git pane. I made the keyboard follow the opened file into the editor.

The Git smoke now checks that move directly. It no longer presses `Tab` to hide the defect.

## READY

Commit: `bf89fe0e0724c1a0edc67fd77e75daa6ca8dc6c3`

The worktree is clean. The conductor can gate and land the commit.

## Reproduction

I drove the real PTY from the Git pane. Each attempt used `Control+p`, typed [project.architecture.md](../../../../project.architecture.md), and pressed `Enter`.

- Pre-fix result: 9 hits in 9 valid attempts.
- Machine pace: 5 hits in 5 attempts.
- Human pace: 4 hits in 4 attempts.
- Before `Enter`, `workspaceSet.active.focus` was `primaryPane`.
- After `Enter`, the file opened but focus stayed `primaryPane`.

I reloaded the app between the eight looped attempts. I excluded one setup attempt because it waited for the wrong raw focus value.

## Cause and fix

[Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) closed Quick Open and called `openFileInTab()`. It did not call the established `focusEditor()` step.

I added `focusEditor()` to the file-mode Quick Open activation path. A final repo drive moved focus from `primaryPane` to `editor`.

[smoke-git-watch-harness.ts](../../../../scripts/harness/smoke-git-watch-harness.ts) already opened `root.txt` from a focused Git pane. I removed its compensating `Tab` key.

The smoke now waits directly for `workspaceSet.active.focus="editor"` after the file opens.

## Positive control

I temporarily removed the focus move and ran the changed smoke. It exited 1 with this failure:

```text
graph wait "workspaceSet.active.focus" did not reach "editor" within 15000ms.
last settled value was "primaryPane"
```

I restored the focus move. The same smoke then reported `ALL-PASS`.

## Invariants

- [Selection stays anchored to an item](../../../../src/modules/ui/ui.invariants.md#selection-stays-anchored-to-an-item) governs the focus transfer. It says opening a file moves keyboard focus to the editor.
- [Quick Open activates the selected entry](../../../../src/modules/search/search.invariants.md#quick-open-activates-the-selected-entry) stayed upheld. The selected and opened paths matched.
- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md#harness-waits-observe-conditions-not-frame-ordinals) stayed upheld. The smoke waits on the settled graph value.
- [Each workspace owns one panel world](../../../../src/modules/workspace/workspace.invariants.md#each-workspace-owns-one-panel-world) owns workspace focus state. It does not specify file-open focus transfer.

The workspace contract has no direct file-open focus record. The UI contract above already governs the behavior.

## Verification

- `bun scripts/harness/smoke-git-watch-harness.ts`: `ALL-PASS`.
- `bun test`: 2,353 passed, 0 failed, 72,111 expectations across 353 files.
- `bunx tsc --noEmit`: exit 0.
- `bun run build`: exit 0. It compiled `dist/iv`.
- `bash scripts/conventions-gate.sh`: `PASS`.
- Invariant checker `--all`: exit 0.
- Invariant checker `--refs`: 1,363 annotations and 266 lattice links resolved, 0 problems.
- `git diff --check`: exit 0.

No merge gate completed. The first commit attempt started its hook without `SKIP_GATE=1`.

I stopped only this task's commit and gate process groups. I then committed with `SKIP_GATE=1`, as the [brief](brief-475-1-quick-open-leaves-focus-behind.md) requires.

## PTY usability

Warm reloads and settled graph waits made the repeated drive quick and stable.

The brief's graph value was misleading. `workspaceSet.active.focus` reports `primaryPane`, not `git`, while the Git pane owns that slot.

The complete Git-focus condition needs both `workspaceSet.active.focus="primaryPane"` and `workspaceSet.active.primaryPaneContentIdentifier="git"`.

## Bycatch

- CONTRACT MAP MISS: the [brief](brief-475-1-quick-open-leaves-focus-behind.md) omitted [Selection stays anchored to an item](../../../../src/modules/ui/ui.invariants.md#selection-stays-anchored-to-an-item). The pre-fix drive violated its file-open focus clause in 9 of 9 attempts.
- DISTILLATION POSSIBILITY: several callers repeat `openFileInTab()` plus an editor-focus move. Sites include [TasksDashboardPlugin.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPlugin.ts), [MarkdownPreviewContent.ts](../../../../src/modules/markdown/MarkdownPreviewContent.ts), [MarkdownWorkspace.ts](../../../../src/modules/markdown/MarkdownWorkspace.ts), [EditorNavigationHistoryContribution.ts](../../../../src/modules/editor/EditorNavigationHistoryContribution.ts), [BreadcrumbPicker.ts](../../../../src/modules/ui/BreadcrumbPicker.ts), and [FileTreeWorkspace.ts](../../../../src/modules/filetree/FileTreeWorkspace.ts). The shared generator may be “a user-opened file gets keyboard focus.” I did not redesign that seam in this task.

COMPACTION: none. Conventions file at `ce08ef9bfa8acba860dbf312d8b138896cde482a`.
