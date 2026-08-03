## In plain words

Some tests waited for words that were already on the screen, so a key or click could fail and the test could still pass. The two worst files now wait for the real selection, focus, scroll, save, or mouse event before they check the screen. Both files pass, including the 500-line and 100,000-line scrollbar drives.

## Result

READY at commit `8a226c2c76301bb5a2a19bc372768bda1f92e43a`.

This round stops at a clean file boundary, as the [brief](brief-479-2-migrate-the-census-tail.md) permits. It completes every class-1 site named for the two priority contention files. It also replaces the repeated Extensions screen-change proxies and the diff-save proxy that the same drives crossed.

| State | Files |
| --- | --- |
| Done in this round | [smoke-plugin-manifest-harness.ts](../../../../scripts/harness/smoke-plugin-manifest-harness.ts): all 14 class-1 sites. [smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts): all 9 class-1 sites plus the 2 missed `renderQuiescent` sites. |
| Done before this round | The five files in [#478 (migrate the pre-satisfied waits)](../../completed/478-migrate-the-pre-satisfied-waits/report-478-migrate-the-pre-satisfied-waits.md), plus the Git watcher migrated in [#471 (graph reaches the whole app)](../../completed/471-graph-reaches-the-whole-app/report-471-graph-reaches-the-whole-app.md). |
| Remaining Quick Open idiom | [smoke-bracket-match-harness.ts](../../../../scripts/harness/smoke-bracket-match-harness.ts), [smoke-git-blame-harness.ts](../../../../scripts/harness/smoke-git-blame-harness.ts), [smoke-image-preview-harness.ts](../../../../scripts/harness/smoke-image-preview-harness.ts), [smoke-breadcrumb-harness.ts](../../../../scripts/harness/smoke-breadcrumb-harness.ts), and [smoke-diagnostics-harness.ts](../../../../scripts/harness/smoke-diagnostics-harness.ts). |
| Remaining shared machinery | [tui-harness.sh](../../../../scripts/tui-harness.sh), [HarnessSmoke.ts](../../../../scripts/harness/HarnessSmoke.ts), [PtyTestDriver.ts](../../../../scripts/harness/PtyTestDriver.ts), and [Drive.ts](../../../../scripts/harness/Drive.ts). |
| Remaining agent and terminal files | [smoke-terminal-follow-harness.ts](../../../../scripts/harness/smoke-terminal-follow-harness.ts), [smoke-agent-cancel-harness.ts](../../../../scripts/harness/smoke-agent-cancel-harness.ts), [smoke-agent-engine-switch-harness.ts](../../../../scripts/harness/smoke-agent-engine-switch-harness.ts), [smoke-agent-search-harness.ts](../../../../scripts/harness/smoke-agent-search-harness.ts), [smoke-agent-harness.ts](../../../../scripts/harness/smoke-agent-harness.ts), [smoke-agent-permissions-harness.ts](../../../../scripts/harness/smoke-agent-permissions-harness.ts), [smoke-agent-pane-ux-harness.ts](../../../../scripts/harness/smoke-agent-pane-ux-harness.ts), [smoke-agent-skill-popup-harness.ts](../../../../scripts/harness/smoke-agent-skill-popup-harness.ts), [smoke-terminal-harness.ts](../../../../scripts/harness/smoke-terminal-harness.ts), [smoke-terminal-backpressure-harness.ts](../../../../scripts/harness/smoke-terminal-backpressure-harness.ts), and [smoke-terminal-stage-harness.ts](../../../../scripts/harness/smoke-terminal-stage-harness.ts). |
| Remaining panel, layout, overlay, Markdown, and task files | [smoke-layout-harness.ts](../../../../scripts/harness/smoke-layout-harness.ts), [smoke-activitybar-harness.ts](../../../../scripts/harness/smoke-activitybar-harness.ts), [smoke-panel-split-harness.ts](../../../../scripts/harness/smoke-panel-split-harness.ts), [smoke-tree-scroll-harness.ts](../../../../scripts/harness/smoke-tree-scroll-harness.ts), [smoke-overlay-dialog-harness.ts](../../../../scripts/harness/smoke-overlay-dialog-harness.ts), [smoke-markdown-harness.ts](../../../../scripts/harness/smoke-markdown-harness.ts), [smoke-markdown-view-mode-harness.ts](../../../../scripts/harness/smoke-markdown-view-mode-harness.ts), [smoke-tasks-dashboard-harness.ts](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts), and [smoke-inline-rewrite-harness.ts](../../../../scripts/harness/smoke-inline-rewrite-harness.ts). |
| Remaining editor, popup, and smaller harness files | [smoke-settings-applied-harness.ts](../../../../scripts/harness/smoke-settings-applied-harness.ts), [smoke-editor-harness.ts](../../../../scripts/harness/smoke-editor-harness.ts), [smoke-workspace-tabs-harness.ts](../../../../scripts/harness/smoke-workspace-tabs-harness.ts), [smoke-code-folding-harness.ts](../../../../scripts/harness/smoke-code-folding-harness.ts), [smoke-pixel-preview-harness.ts](../../../../scripts/harness/smoke-pixel-preview-harness.ts), [smoke-bounded-list-popup-harness.ts](../../../../scripts/harness/smoke-bounded-list-popup-harness.ts), [smoke-field-caret-harness.ts](../../../../scripts/harness/smoke-field-caret-harness.ts), [smoke-navigation-history-harness.ts](../../../../scripts/harness/smoke-navigation-history-harness.ts), [smoke-clipboard-frame-boundary-harness.ts](../../../../scripts/harness/smoke-clipboard-frame-boundary-harness.ts), [smoke-paste-harness.ts](../../../../scripts/harness/smoke-paste-harness.ts), [smoke-openproject-harness.ts](../../../../scripts/harness/smoke-openproject-harness.ts), [smoke-comment-styling-harness.ts](../../../../scripts/harness/smoke-comment-styling-harness.ts), [smoke-git-log-harness.ts](../../../../scripts/harness/smoke-git-log-harness.ts), [smoke-hover-harness.ts](../../../../scripts/harness/smoke-hover-harness.ts), [smoke-horizontal-extent-harness.ts](../../../../scripts/harness/smoke-horizontal-extent-harness.ts), [smoke-diff-overview-harness.ts](../../../../scripts/harness/smoke-diff-overview-harness.ts), [smoke-word-delete-harness.ts](../../../../scripts/harness/smoke-word-delete-harness.ts), [smoke-voice-picker-harness.ts](../../../../scripts/harness/smoke-voice-picker-harness.ts), [smoke-quickopen-harness.ts](../../../../scripts/harness/smoke-quickopen-harness.ts), and [smoke-mode-coherence-harness.ts](../../../../scripts/harness/smoke-mode-coherence-harness.ts). |
| Remaining shell sites | [smoke-editor.sh](../../../../scripts/smoke-editor.sh), [smoke-gutter-diff.sh](../../../../scripts/smoke-gutter-diff.sh), [smoke-tree-scroll.sh](../../../../scripts/smoke-tree-scroll.sh), [smoke-paste.sh](../../../../scripts/smoke-paste.sh), [smoke-scrollbars.sh](../../../../scripts/smoke-scrollbars.sh), [smoke-panel-split.sh](../../../../scripts/smoke-panel-split.sh), and [smoke-activitybar.sh](../../../../scripts/smoke-activitybar.sh). |

The [wait-defect census](../../completed/470-harness-wait-defect-census/census-470-harness-wait-defect-census.md) remains the exact per-site list for every remaining file.

## Changes

The plugin manifest smoke now uses one shared Extensions selection walk. Each Down key waits for `primaryDockHost.activeContent.selectedIndex`, then waits for the selected row paint to change. The final named row is an assertion. Setting headings now assert row order. Disabled extension rows, installed editor text, and the structure-filter tone are assertions after an authoritative transition. The inert language gestures now finish on a live Extensions focus response and one coherent status read.

The plugin smoke also polls its own instance-stamped diagnostic log directly. The former grid wait ignored the grid snapshot, so a diagnostic line that did not cause a later screen frame could time out even after the line existed.

The scrollbar smoke now moves the source away from row 0 before it waits for `Control+Home` to return through `workspaceSet.active.editor.viewport.scrollTop`. Markdown preview leadership is read from the contributor graph at settle boundaries. The diff probe now owns a status path, waits for the edited file to reach disk, and waits for Git focus before it sends `o`. The coarse-scroll halt now waits for the real mouse release, then for momentum to reach rest. Duplicate settled-frame, clipping, and agent-focus waits are gone.

The coverage record now declares the exact changes in [project.coverage-deltas.md](../../../../project.coverage-deltas.md): plugin manifest assertions 50 → 61 and waits 167 → 154; scrollbars assertions 58 → 61 and waits 72 → 67.

## Positive controls

Both temporary defects failed. I restored them before the green runs.

| Control | Planted defect | Red result |
| --- | --- | --- |
| Shared Extensions selection walk | Asked the graph for selection index 2 after the real Down stopped at index 1. | Exit 1. The named graph wait timed out and reported last settled value 1. |
| Scrollbar return at small scale | Asked the graph for source scroll row 1 after `Control+Home`. | Exit 1 in the 500-line arm. The named graph wait reported last settled value 0. |

## Invariants

- [Harness waits observe conditions not frame ordinals](../../../../scripts/harness/harness.invariants.md): strengthened. New waits observe a changed graph value, a changed selected row, an acknowledged input, a disk write, or a status transition.
- [Every wait names itself](../../../../scripts/harness/harness.invariants.md): upheld. The new graph, status, diagnostic, disk, and grid waits name the exact fact.
- [Async-published state is always awaited](../../../../scripts/harness/harness.invariants.md): upheld. The later assertions follow graph settle, status publication, disk publication, or changed paint.
- [The composition graph reaches every installed contributor](../../../../src/modules/system/system.invariants.md): upheld. Extensions selection and Markdown preview leadership resolved through the live composition graph.
- [Coverage may fall but never silently](../../../../project.invariants.md): upheld. Both decreases are declared and the coverage ratchet passed.

No invariant record changed. The final checker found 0 problems.

## Verification

- [smoke-plugin-manifest-harness.ts](../../../../scripts/harness/smoke-plugin-manifest-harness.ts): PASS.
- [smoke-scrollbars-harness.ts](../../../../scripts/harness/smoke-scrollbars-harness.ts): ALL-PASS. Its shared scale drive passed at 500 and 100,000 lines.
- `bun test`: PASS. 2,353 tests across 353 files, 72,111 expectations, 0 failures.
- `bunx tsc --noEmit`: PASS.
- `bash scripts/conventions-gate.sh`: PASS. It reported 20 existing legacy grammar violations.
- `bun scripts/check-coverage-ratchet.ts`: PASS. It inspected 392 files and found no undeclared decrease against `a9700d9`.
- Invariant checker `--all`: PASS for every record.
- Invariant checker `--refs`: PASS. 1,363 annotations, 266 lattice links, 0 problems.

I did not run `scripts/merge-gate.sh` or `scripts/behavioral-contracts.sh`.

## PTY usability

- Easy: graph paths made Extensions selection, editor scroll return, and Markdown pane leadership direct. The same scrollbar drive covered 500 and 100,000 lines.
- Confusing: a timed-out graph wait says that a resolved path did not resolve, then prints its last settled value. Both positive controls showed this message.
- Missing: nested probe drivers do not get a status path automatically. The diff probe had to declare its own `TUI_STATUS_PATH` before status and graph waits could address that app instance.

## Bycatch

- Not fixed: `GraphClient.awaitValue` reports a resolved wrong value as a path miss. The Extensions control said the path did not resolve while it also reported last settled value 1. The scrollbar control did the same with last settled value 0. This reproduced twice.
- Not fixed: the [census](../../completed/470-harness-wait-defect-census/census-470-harness-wait-defect-census.md) recommends dropping Tab from the vertical-thumb probe. The live graph showed that Quick Open had not returned focus to the editor without Tab. I retained the real Tab and awaited `workspaceSet.active.focus='editor'`. This reproduced in two failed runs before the correction.

No other bycatch was observed.
