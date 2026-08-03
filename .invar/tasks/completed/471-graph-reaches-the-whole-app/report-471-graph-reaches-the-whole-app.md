## In plain words

The live graph stopped at a short list, so it could not see the file tree or Git controller. I made the app's real composition object own the graph root and made its contributor catalog automatic. A folder click and a saved edit now change the graph values that describe them.

## Result

READY at commit `bea1687d9cff00a59e82dddc048e44f5527e1240`.

- [Bootstrap](../../../../src/modules/app/Bootstrap.ts) now builds one `BootedApp` composition object. Boot returns that object, status projection reads it, and `GraphChannel` roots at it.
- [ApplicationContributions](../../../../src/modules/app/ApplicationContributions.ts) exposes every installed contributor by its own identifier. Bootstrap does not repeat contributor membership.
- [WorkspaceSet](../../../../src/modules/workspace/WorkspaceSet.ts) now has the real `activeEditor`, `activeDocument`, and `activeLanguageProviderNotice` getters.
- [FileTreeContributor](../../../../src/modules/filetree/FileTreeContributor.ts) exposes its active workspace. [FileTreeWorkspace](../../../../src/modules/filetree/FileTreeWorkspace.ts) owns the `rowCount` getter.
- [GitPlugin](../../../../src/modules/git/GitPlugin.ts) exposes its active workspace. [GitWorkspace](../../../../src/modules/git/GitWorkspace.ts) owns `changedCount` and `repositoryScanCompleted`.
- The composition also owns both `TabStrip` models and the renderer. The graph can now read tab pan offsets and terminal dimensions without a projection alias.
- The [tree smoke](../../../../scripts/harness/smoke-tree-scroll-harness.ts) and [Git watcher smoke](../../../../scripts/harness/smoke-git-watch-harness.ts) lock in the contributor paths. The [drive guide](../../../../.claude/skills/drive-pty/SKILL.md) now names the composition root and contributor paths.

The enablement gate did not change. `GraphChannel` still arms only when the existing observation environment enables `StatusChannel`.

## Driven proof

I used one warm `DriveSession` server and stopped it when the probes ended.

- Before the change, `workspaceSet.activeEditor`, `workspaceSet.activeDocument`, `contributors.file-tree`, and `contributors.git` all failed at the curated root.
- In a small three-row repository, a real click on `nested` changed `contributors.file-tree.activeWorkspace.rowCount` from `3` to `4`.
- A real click on `alpha.txt`, `End`, typed `x`, and `Control+s` changed `contributors.git.activeWorkspace.changedCount` from `0` to `1`.
- The scale tree smoke resolved the same row-count path at `61` rows and waited for `122` rows after Quick Open revealed the target through 60 branch rows. Its one-row fixture also passed.
- The Git smoke waited for `repositoryScanCompleted=true`, then drove Quick Open, a focus transfer, an edit, and a save. The graph count moved `0 → 1 → 0`. Its external watcher arm also moved `0 → 3 → 0`.
- The wrong path `contributors.not-installed.activeWorkspace` failed at `contributors` and listed all 15 installed identifiers. The earlier planted smoke defect `contributors.missing.activeWorkspace.rowCount` returned exit 1. I removed the planted defect before the green run.

The permanent smokes assert model end state. They do not assert travel timing or driver internals.

## Census recheck

I rechecked all 34 lines that match “no model path” or “no graph path” in [#470 (harness wait-defect census)](../../completed/470-harness-wait-defect-census/census-470-harness-wait-defect-census.md). The census repeats some findings in its batch summaries. This table folds those repeats by missing fact.

| Census fact | Result after this change | Live path or remaining reason |
|---|---|---|
| Markdown pane focus | Migratable | `contributors.markdown.surface.previewContent.splitView.focusedPane` |
| Markdown hovered reference | Migratable | `contributors.markdown.surface.previewContent.splitView.hoveredReferencePath` |
| Clean Git zero versus an unfinished scan | Migratable | Wait for `contributors.git.activeWorkspace.repositoryScanCompleted=true`, then read `.changedCount`. |
| File-tree row count and folder expansion | Migratable | `contributors.file-tree.activeWorkspace.rowCount` |
| Tasks dashboard lens transition | Migratable | `contributors.tasks-dashboard.overview.lens` |
| Git log keyboard or click selection | Migratable | `contributors.git.activeWorkspace.panel.logIndex` |
| Git log scroll | Migratable | `contributors.git.activeWorkspace.panel.logScrollTop` |
| Git watcher activation | Migratable | `contributors.git.activeWorkspace.activationCompleted` |
| Agent transcript delivery | Migratable | `agentPaneContent.agentSession.transcript.length` |
| Terminal selection cleared | Migratable | `terminalPaneContent.selection.anchor` and `.focus` reach `null`. |
| Extensions selection | Migratable after the Extensions gesture | `primaryDockHost.activeContent.selectedIndex` |
| File-tree scroll | Migratable | `contributors.file-tree.activeWorkspace.tree.scrollTop` |
| File-tree hover | Migratable | `contributors.file-tree.activeWorkspace.tree.hoveredIndex` |
| File-tree click opened a file | Migratable | `workspaceSet.activeDocument.path` |
| Buffer-tab strip pan | Migratable | `bufferTabStrip.scrollOffset` |
| Workspace-tab strip pan | Migratable | `workspaceTabStrip.scrollOffset` |
| Language-provider notice | Migratable | `workspaceSet.activeLanguageProviderNotice` |
| Terminal dimensions | Migratable | `renderer.width` and `renderer.height` |
| Permission prompt “remains” | Not a graph condition | It needs an observation window. A single retained value cannot prove absence over time. |
| Settings first and last visible descriptor | Still missing | The settings viewport window remains closure-owned in `OverlayLayer` and has no real getter. |
| Right-dock scrollbar geometry | Still missing | The value exists only in the debug-bar log. |
| Frame stability | Not a model fact | Use the completed frame returned by the screen condition. |
| Copy ran and copied zero characters | Still missing | The app has no copy-attempt counter, so zero still matches “never dispatched.” |
| Exact staged terminal input | Still missing | `outputRevision` is reachable, but it does not retain the exact input line. The screen remains the honest oracle. |
| Exact child-PTY prompt or output | Still missing | The pane exposes revisions and events, not a retained semantic fact for the requested bytes. Use a scoped grid condition. |

## Invariants

- [Graph observation reads and never mutates](../../../../src/modules/system/system.invariants.md): PASS. The resolver did not change. The new composition, contributor, count, notice, and scan getters only read owned state. Discovery still lists keys without evaluating them.
- [Observability never crashes the app](../../../../src/modules/system/system.invariants.md): PASS. A wrong path returned a loud miss with the dead node and available keys. The app stayed live for later probes.
- [Derived state is a plain getter unless caching is proven](../../../../project.invariants.md): PASS. Every shortcut and count is a plain getter. None adds a Ref, cache, watcher, or status mirror.
- [Workspace and file navigation are separate layers](../../../../src/modules/workspace/workspace.invariants.md): PASS. `WorkspaceSet` only forwards the selected workspace's editor, document, and provider notice. It does not take ownership from the workspace.
- [N open workspaces do not cost N live GitWatchers](../../../../src/modules/workspace/workspace.invariants.md): PASS. The new Git getters read the already-active workspace. They do not create or retain watchers.
- [The tree reveal follows the active file](../../../../src/modules/filetree/filetree.invariants.md): PASS. The scale smoke used the existing real Quick Open reveal and observed only its final row count.
- [The Git panel converges without watcher notifications](../../../../src/modules/git/git.invariants.md): PASS. The Git smoke covered both a saved editor change and external changes, then observed both return to zero.
- The ivue namespace forms stayed unchanged. Plain getters use the existing reactive instances and do not add a second state vocabulary.

## Verification

- `bun test`: PASS, 2,346 tests across 351 files, 72,052 expectations, 0 failures.
- `bunx tsc --noEmit`: PASS.
- `bash scripts/conventions-gate.sh`: PASS. It reported the existing 20 legacy file-grammar violations and no enforced-module violations.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all`: PASS for every record.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --refs`: PASS, 1,359 annotations, 266 lattice links, 0 problems.
- `bun scripts/harness/smoke-tree-scroll-harness.ts`: ALL-PASS.
- `bun scripts/harness/smoke-git-watch-harness.ts`: ALL-PASS.
- The end pass ran every required check. TypeScript first found one nullable test expectation, and conventions first rejected two `Implementation` suffixes. I fixed those exact findings, reran TypeScript and conventions, and reran the full tests on the committed content. I did not repeat the invariant checks or driven smokes.
- I did not run the merge gate or behavioral contracts, as the [task brief](brief-471-2-graph-reaches-the-whole-app.md) requires.

## PTY usability

- Easy: the warm server made the loop fast. `clickText`, `waitFor`, and `get` kept the gesture, condition, and observation in one short probe. Loud misses made contributor discovery immediate.
- Confusing: `bun run drive` and `DriveSession` have different stop commands. The warm server needs `bun scripts/harness/DriveSession.ts --stop`.
- Missing: `DriveSession` has no generated `--size` fixture option. I used the shared scale smoke for the large arm instead of repeating the same warm-session snippet at generated scale.
- Missing: an attached snippet that throws prints `attach: snippet failed` but returns shell exit code 0. A script can overlook a failed positive control unless it parses output. `GraphClient` in the permanent smokes does return a non-zero process result.

## Bycatch

- Suspect focus bug, not fixed: from a focused Git pane, `Control+p`, `root.txt`, `Enter` opened the file but left `workspaceSet.active.focus` at `git`. The following `End` and typed `x` did not dirty the document. This reproduced once in the first Git smoke run. The contract now sends the real `Tab` gesture and waits for `focus=editor` before it edits.
- Instrument bug, not fixed: `DriveSession --attach` printed a loud wrong-path failure but exited with code 0. I observed it once with `contributors.not-installed.activeWorkspace`.
- Contract-layer gap, not fixed: [system.invariants.md](../../../../src/modules/system/system.invariants.md) governs graph read safety and crash isolation, but no record states that the composition graph reaches every installed contributor. The behavior now promises that reach, so the domain needs a reach-completeness record.
- Conductor-map miss: the [brief](brief-471-2-graph-reaches-the-whole-app.md) did not list [Derived state is a plain getter unless caching is proven](../../../../project.invariants.md), although it governs every shortcut added here. The implementation obeys it.

No bycatch received a code change.
