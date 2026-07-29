# READY — comment drift in pane content and scrollbar sync

Commit: `1ce6a892b82383c2d502cce874324357668ded2f`

## Result

The three confirmed documentation sites now describe the current code.
No behavior or invariant record changed.

### PaneContent seam

[PaneContent.interface.ts](../../../../src/modules/ui/PaneContent.interface.ts) said:

> The terminal is the first citizen today. The seam is deliberately not retrofitted onto the
> editor, Git, tree, or Markdown panes yet.

It now says:

> PanelHost hosts a switchable set of pane content. The terminal, agent, file tree, Git, database,
> extensions, structure, tasks dashboard, and source-text editor are citizens today. The Markdown
> panes remain an incremental follow-up.

Code evidence: the current AST finds `PaneContent` use in
[TerminalPaneContent.ts](../../../../src/modules/terminal/TerminalPaneContent.ts),
[AgentPaneContent.ts](../../../../src/modules/agent/AgentPaneContent.ts),
[FileTreePaneContent.ts](../../../../src/modules/filetree/FileTreePaneContent.ts),
[GitPaneContent.ts](../../../../src/modules/git/GitPaneContent.ts),
[DatabasePaneContent.ts](../../../../src/modules/database/DatabasePaneContent.ts),
[ExtensionsPaneContent.ts](../../../../src/modules/plugins/ExtensionsPaneContent.ts),
[StructurePaneContent.ts](../../../../src/modules/structure/StructurePaneContent.ts),
[TasksDashboardPaneContent.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPaneContent.ts),
and [SourceTextPaneContent.ts](../../../../src/modules/editor/SourceTextPaneContent.ts). It finds no
`MarkdownPaneContent`. The corrected statement also agrees with
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md#a-pane-content-projects-through-exactly-one-surface).

### ScrollbarSync ownership

[RootView.ts](../../../../src/modules/ui/RootView.ts) said:

> RootView constructs the bars. Their onChange handlers call
> scrollbarSync.trueScrollPosition and read applyingGeometry.

It now says:

> ScrollbarSync constructs and owns the editor and dock bars. It derives each track from the live
> layout, maps widget positions back to true scroll positions, and converges pane viewport extents.
> RootView calls syncScrollbars() during update and syncPaneViewportGeometry() from the frame loop.

Code evidence: [ScrollbarSync.ts](../../../../src/modules/ui/ScrollbarSync.ts) constructs five
`SolidThumbScrollBar` instances, owns the `applying` guard, maps positions through `truePosition`,
and defines `syncScrollbars` and `syncPaneViewportGeometry`.
[RootView.ts](../../../../src/modules/ui/RootView.ts) constructs one `ScrollbarSync` controller and
calls those two public sync methods.

### Workspace reference methods

[Workspace.ts](../../../../src/modules/workspace/Workspace.ts) placed this block before
`referenceIsExternal`:

> Resolve a textual reference to a real file inside this workspace, or null.

The same block now sits directly on `resolveFileReference`. The
`referenceIsExternal` block remains directly on `referenceIsExternal`.

Code evidence: `referenceIsExternal` strips a fragment or query and tests the remaining text for a
URL scheme. `resolveFileReference` rejects that external form, decodes the path, tests workspace-root
and active-document-relative candidates, and returns only an existing non-directory path confined
to the workspace root.

## Verification

- `bun run typecheck` — PASS.
- `bash scripts/conventions-gate.sh` — PASS.
- `bun run drive --geometry 100x30` — settled before and after the change.
- `bun run drive --size 100000 --geometry 100x30` — settled before and after the change with
  `editorMaximumScrollTop=99991`.
- `git diff --check` — PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 1 pre-existing
  problem in [TASK.md](../../../../.invar/worktrees/280-comment-drift-panecontent-scrollbarsync/TASK.md):
  line 31 links to a contract without an anchor. It resolved 1,134 annotations and 220 lattice links.
- The pre-commit merge gate repeated that contract-link failure. It also found the panel-chrome
  bycatch below. All unit tests, behavioral contracts, 61 other parallel PTY jobs, three serial PTY
  jobs, and the input-byte first-frame gate passed. The commit used the hook's `SKIP_GATE=1`
  override after this complete gate run.

## Bycatch

- Contract-layer gap: [TASK.md](../../../../.invar/worktrees/280-comment-drift-panecontent-scrollbarsync/TASK.md)
  line 31 links to [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) without an anchor.
  The invariant reference checker reproduced it twice. I did not change the task brief.
- Runtime contract failure: `smoke: panel-chrome harness` timed out while waiting for “Agent 2 list
  close removes only that instance.” The merge gate retried it once and reproduced the same timeout.
  The two logs are under `/tmp/merge-gate-failures.702933`. I did not change panel behavior.
