## In plain words

The full smoke set needs 189 Invar starts when every smoke reaches its end. Thirty-five starts repeat work that one app in the same file could do after a checked reset. The other 154 starts prove startup, restart, process exit, capability, saved-state, or fixed-size behavior, so they must stay.

## Result

This is the READY report for [task 485 (measure the reclaimable boot churn)](task-485-measure-the-reclaimable-boot-churn.md). I measured all 73 live smoke files at commit `fe0b9e48e15447500e3997b0142f243d53bcaad8`. I made no source, smoke, or contract change.

The complete population is 189 Invar starts. Of these starts, 35 are reclaimable. That is 18.5% of the population and 8,260 MB-boots at the supplied 236 MB per boot.

I used a strict classification. A start is semantic when the smoke proves that startup loads a setting, restores saved state, selects a provider or terminal capability, fixes required geometry, restarts the app, or exits the process. I did not assume that a reset can make a running process repeat startup. I marked a start reclaimable only when the same app can prove the claim after a visible setting or workspace change and a graph-verified reset.

## Method and coverage

I ran the [source census](../../completed/484-per-file-smoke-reuse-experiment/484-smoke-runtime-boot-census.ts) once. It found 120 direct driver construction sites in 73 smoke files. I then ran every file alone and in sequence with the [runtime counter](../../completed/484-per-file-smoke-reuse-experiment/484-runtime-boot-counter-preload.ts). Seventy-one files reached `ALL-PASS`. The scrollbar and plugin-manifest files failed at existing or unrelated conditions described under Bycatch.

I made two corrections before I totaled Invar starts:

- The runtime counter reported three starts in the terminal smoke. One driver runs `scripts/tasks/tasks-status.ts watch`, not Invar. The table counts the two Invar starts.

- The scrollbar run stopped after its third start. The complete control flow has seven starts: two drag scales, wrap off, wrap on, diff, overflow, and fitting geometry. The table uses seven because the requested total is the complete full-gate population. The observed red prefix was three.

The setting-applied smoke has 35 semantic starts. Its file contract says each value is loaded from the isolated HOME before its effect is checked. A shared running app would prove live application instead of startup application, so it would not prove the same claim.

## Classification

The table counts complete Invar starts, not every `PtyTestDriver` construction. A dash means that the file has no reclaimable start.

| File | Runtime boots | Semantic | Reclaimable | One-line reason for reclaimable starts |
|---|---:|---:|---:|---|
| [settings applied](../../../../scripts/harness/smoke-settings-applied-harness.ts) | 35 | 35 | 0 | — |
| [pixel preview](../../../../scripts/harness/smoke-pixel-preview-harness.ts) | 8 | 8 | 0 | — |
| [tasks](../../../../scripts/harness/smoke-tasks-harness.ts) | 8 | 8 | 0 | — |
| [Markdown](../../../../scripts/harness/smoke-markdown-harness.ts) | 7 | 3 | 4 | Theme and scale helpers can reuse one app for each required geometry. |
| [scrollbars](../../../../scripts/harness/smoke-scrollbars-harness.ts) | 7 | 4 | 3 | Scale and wrap or diff helpers can reuse apps inside their fixed geometry and debug context. |
| [activity bar](../../../../scripts/harness/smoke-activitybar-harness.ts) | 6 | 3 | 3 | Git-count and glyph-tier helpers can reuse the main app after workspace and setting resets. |
| [panel chrome](../../../../scripts/harness/smoke-panel-chrome-harness.ts) | 6 | 3 | 3 | Right-dock and general chrome drives can reuse the restored-state apps at the two sizes. |
| [terminal follow](../../../../scripts/harness/smoke-terminal-follow-harness.ts) | 6 | 6 | 0 | — |
| [layout](../../../../scripts/harness/smoke-layout-harness.ts) | 5 | 3 | 2 | The three same-size glyph helpers need one app after live setting resets. |
| [Markdown view mode](../../../../scripts/harness/smoke-markdown-view-mode-harness.ts) | 5 | 3 | 2 | The two scale fixtures can reuse a persistence app after a workspace reset. |
| [tasks dashboard](../../../../scripts/harness/smoke-tasks-dashboard-harness.ts) | 5 | 2 | 3 | Same-size glyph, workspace, and scale arms can reuse one app at each size. |
| [terminal stage](../../../../scripts/harness/smoke-terminal-stage-harness.ts) | 5 | 1 | 4 | Motion, typing, and clean-prompt arms use one size and can reset their live settings and panes. |
| [media](../../../../scripts/harness/smoke-media-harness.ts) | 4 | 3 | 1 | The half-block animation and fake-video arms share one graphics and ffmpeg capability context. |
| [mode coherence](../../../../scripts/harness/smoke-mode-coherence-harness.ts) | 4 | 4 | 0 | — |
| [completion](../../../../scripts/harness/smoke-completion-harness.ts) | 3 | 2 | 1 | The two tsgo scale fixtures can reuse one provider app after a workspace reset. |
| [panel split](../../../../scripts/harness/smoke-panel-split-harness.ts) | 3 | 2 | 1 | The general panel drive can continue in one of the two capability-tier apps after reset. |
| [tree scroll](../../../../scripts/harness/smoke-tree-scroll-harness.ts) | 3 | 1 | 2 | The short-tree and setting-off arms can reuse the main app after workspace and setting resets. |
| [terminal](../../../../scripts/harness/smoke-terminal-harness.ts) | 2 | 2 | 0 | — |
| [agent engine switch](../../../../scripts/harness/smoke-agent-engine-switch-harness.ts) | 2 | 2 | 0 | — |
| [audio narration](../../../../scripts/harness/smoke-audio-narration-harness.ts) | 2 | 2 | 0 | — |
| [breadcrumb](../../../../scripts/harness/smoke-breadcrumb-harness.ts) | 2 | 1 | 1 | Small and large fixtures can use one app after a workspace reset. |
| [diagnostics](../../../../scripts/harness/smoke-diagnostics-harness.ts) | 2 | 2 | 0 | — |
| [Git watch](../../../../scripts/harness/smoke-git-watch-harness.ts) | 2 | 1 | 1 | The symlink-workspace arm can reuse the first app after a workspace reset. |
| [go to line](../../../../scripts/harness/smoke-go-to-line-harness.ts) | 2 | 1 | 1 | Small and large fixtures can use one app after a workspace reset. |
| [gutter diff](../../../../scripts/harness/smoke-gutter-diff-harness.ts) | 2 | 1 | 1 | Edit and delete arms can share one app after the fixture and editor state reset. |
| [indent guides](../../../../scripts/harness/smoke-indent-guides-harness.ts) | 2 | 1 | 1 | The enabled and disabled arms can share one app after a live setting reset. |
| [overlay dialog](../../../../scripts/harness/smoke-overlay-dialog-harness.ts) | 2 | 1 | 1 | The context-menu arm can reuse the main app after workspace and overlay resets. |
| [Quick Open](../../../../scripts/harness/smoke-quickopen-harness.ts) | 2 | 2 | 0 | — |
| [quit confirmation](../../../../scripts/harness/smoke-quit-confirmation-harness.ts) | 2 | 2 | 0 | — |
| [renderable disposal](../../../../scripts/harness/smoke-renderable-disposal-harness.ts) | 2 | 2 | 0 | — |
| [agent cancel](../../../../scripts/harness/smoke-agent-cancel-harness.ts) | 1 | 1 | 0 | — |
| [agent](../../../../scripts/harness/smoke-agent-harness.ts) | 1 | 1 | 0 | — |
| [agent pane UX](../../../../scripts/harness/smoke-agent-pane-ux-harness.ts) | 1 | 1 | 0 | — |
| [agent permissions](../../../../scripts/harness/smoke-agent-permissions-harness.ts) | 1 | 1 | 0 | — |
| [agent search](../../../../scripts/harness/smoke-agent-search-harness.ts) | 1 | 1 | 0 | — |
| [agent skill popup](../../../../scripts/harness/smoke-agent-skill-popup-harness.ts) | 1 | 1 | 0 | — |
| [bounded list popup](../../../../scripts/harness/smoke-bounded-list-popup-harness.ts) | 1 | 1 | 0 | — |
| [bracket match](../../../../scripts/harness/smoke-bracket-match-harness.ts) | 1 | 1 | 0 | — |
| [clipboard frame boundary](../../../../scripts/harness/smoke-clipboard-frame-boundary-harness.ts) | 1 | 1 | 0 | — |
| [code folding](../../../../scripts/harness/smoke-code-folding-harness.ts) | 1 | 1 | 0 | — |
| [comment styling](../../../../scripts/harness/smoke-comment-styling-harness.ts) | 1 | 1 | 0 | — |
| [database](../../../../scripts/harness/smoke-database-harness.ts) | 1 | 1 | 0 | — |
| [diff overview](../../../../scripts/harness/smoke-diff-overview-harness.ts) | 1 | 1 | 0 | — |
| [dirty marker](../../../../scripts/harness/smoke-dirty-marker-harness.ts) | 1 | 1 | 0 | — |
| [editor](../../../../scripts/harness/smoke-editor-harness.ts) | 1 | 1 | 0 | — |
| [field caret](../../../../scripts/harness/smoke-field-caret-harness.ts) | 1 | 1 | 0 | — |
| [find](../../../../scripts/harness/smoke-find-harness.ts) | 1 | 1 | 0 | — |
| [Git blame](../../../../scripts/harness/smoke-git-blame-harness.ts) | 1 | 1 | 0 | — |
| [Git log](../../../../scripts/harness/smoke-git-log-harness.ts) | 1 | 1 | 0 | — |
| [go to definition](../../../../scripts/harness/smoke-goto-definition-harness.ts) | 1 | 1 | 0 | — |
| [horizontal extent](../../../../scripts/harness/smoke-horizontal-extent-harness.ts) | 1 | 1 | 0 | — |
| [hover](../../../../scripts/harness/smoke-hover-harness.ts) | 1 | 1 | 0 | — |
| [image preview](../../../../scripts/harness/smoke-image-preview-harness.ts) | 1 | 1 | 0 | — |
| [inline rewrite](../../../../scripts/harness/smoke-inline-rewrite-harness.ts) | 1 | 1 | 0 | — |
| [monitoring](../../../../scripts/harness/smoke-monitoring-harness.ts) | 1 | 1 | 0 | — |
| [move line](../../../../scripts/harness/smoke-move-line-harness.ts) | 1 | 1 | 0 | — |
| [navigation history](../../../../scripts/harness/smoke-navigation-history-harness.ts) | 1 | 1 | 0 | — |
| [open project](../../../../scripts/harness/smoke-openproject-harness.ts) | 1 | 1 | 0 | — |
| [paste](../../../../scripts/harness/smoke-paste-harness.ts) | 1 | 1 | 0 | — |
| [plugin manifest](../../../../scripts/harness/smoke-plugin-manifest-harness.ts) | 1 | 1 | 0 | — |
| [reserved chord](../../../../scripts/harness/smoke-reserved-chord-harness.ts) | 1 | 1 | 0 | — |
| [SDK extraction](../../../../scripts/harness/smoke-sdk-extraction-harness.ts) | 1 | 1 | 0 | — |
| [search mouse](../../../../scripts/harness/smoke-search-mouse-harness.ts) | 1 | 1 | 0 | — |
| [selection](../../../../scripts/harness/smoke-selection-harness.ts) | 1 | 1 | 0 | — |
| [shortcut help](../../../../scripts/harness/smoke-shortcut-help-harness.ts) | 1 | 1 | 0 | — |
| [tabs](../../../../scripts/harness/smoke-tabs-harness.ts) | 1 | 1 | 0 | — |
| [terminal backpressure](../../../../scripts/harness/smoke-terminal-backpressure-harness.ts) | 1 | 1 | 0 | — |
| [text input](../../../../scripts/harness/smoke-text-input-harness.ts) | 1 | 1 | 0 | — |
| [voice picker](../../../../scripts/harness/smoke-voice-picker-harness.ts) | 1 | 1 | 0 | — |
| [word delete](../../../../scripts/harness/smoke-word-delete-harness.ts) | 1 | 1 | 0 | — |
| [workspace layout isolation](../../../../scripts/harness/smoke-workspace-layout-isolation-harness.ts) | 1 | 1 | 0 | — |
| [workspace tabs](../../../../scripts/harness/smoke-workspace-tabs-harness.ts) | 1 | 1 | 0 | — |
| [wrap](../../../../scripts/harness/smoke-wrap-harness.ts) | 1 | 1 | 0 | — |

## Invariants

- [Harness app homes are complete and isolated](../../../../scripts/harness/harness.invariants.md#harness-app-homes-are-complete-and-isolated): the classification keeps every start that proves HOME-loaded settings, saved workspace state, or fresh-provider state. No isolation behavior changed.

- [Coverage may fall but never silently](../../../../project.invariants.md#coverage-may-fall-but-never-silently): no smoke was converted or removed. The reclaimable count is a measurement, not permission to delete an assertion.

The brief's invariant map covered the behavior I measured. I found no missing contract record for this measurement-only work.

## Positive controls

The activity-bar file has five direct construction sites, but the runtime counter reported six starts. The pixel-preview file also has five direct sites, but the counter reported eight starts. These results match [task 484 (per-file smoke reuse experiment)](../../completed/484-per-file-smoke-reuse-experiment/report-484-per-file-smoke-reuse-experiment.md) and prove that the runtime preload sees repeated helper calls.

The pixel-preview classification also keeps all four starts in its two same-HOME restart pairs. Its other four starts establish or renegotiate graphics capabilities, so all eight are semantic.

The scrollbar run supplied a red control. It stopped at the same third-start wrap-off width condition in the original sweep and a second solo run. The plugin-manifest run also stopped at the same focus condition in the original sweep and a second solo run. The counter and sweep therefore do not only produce green counts.

## Verification

- The source census completed with `TOTAL 120 direct boot sites in 73 smoke files`.

- The solo runtime sweep covered 73 of 73 live smoke files. It ran one file at a time.

- Seventy-one files reached `ALL-PASS`. Two files produced the bycatch below.

- The classification rows total 189 runtime Invar starts, 154 semantic starts, and 35 reclaimable starts.

- I did not run `scripts/merge-gate.sh`, as the brief required.

- The worktree stayed clean at `fe0b9e48e15447500e3997b0142f243d53bcaad8`. This report is the only task output.

## Bycatch

- [Scrollbar smoke](../../../../scripts/harness/smoke-scrollbars-harness.ts): `the wrap-off editor reclaims the concealed dock's columns` timed out after the first two scale starts. It reproduced in a second solo run. The same condition was already reported by [task 484 (per-file smoke reuse experiment)](../../completed/484-per-file-smoke-reuse-experiment/report-484-per-file-smoke-reuse-experiment.md), so I did not fix it.

- [Plugin-manifest smoke](../../../../scripts/harness/smoke-plugin-manifest-harness.ts): `the dirty manifest regains editor focus` timed out after the earlier manifest assertions passed. It reproduced in a second solo run. I did not fix it.

- Runtime counter contract drift: the [runtime counter](../../completed/484-per-file-smoke-reuse-experiment/484-runtime-boot-counter-preload.ts) says it counts Invar apps, but it counts every `PtyTestDriver` construction. The [terminal smoke](../../../../scripts/harness/smoke-terminal-harness.ts) uses one such driver for `scripts/tasks/tasks-status.ts watch`, so the instrument overcounts Invar by one there.

- Prior report count drift: [task 484 (per-file smoke reuse experiment)](../../completed/484-per-file-smoke-reuse-experiment/report-484-per-file-smoke-reuse-experiment.md) reports six scrollbar starts. The source has five constructor sites and two repeated calls, so a complete run has seven starts. The report counted one repeated call and missed the other.

## Instrument feedback

EASY: The source census named each constructor and enclosing helper. That made repeated-call review direct. The runtime preload gave a clear final count for every file that completed.

CONFUSING: A driver construction is not always an Invar start. The preload's `HARNESS_RUNTIME_BOOT_COUNT` label hid that distinction until the terminal file's custom command was read.

MISSING: The runtime counter needs to inspect the driver's command and report Invar starts separately from other PTY subjects. It also needs a planned-count mode for a smoke that fails before later constructor calls.

## Totals

| Metric | Total |
|---|---:|
| Live smoke files measured | 73 |
| Complete full-run Invar boots | 189 |
| Semantic boots | 154 |
| Reclaimable boots | 35 |
| Reclaimable share | 18.5% |
| Reclaimable churn at 236 MB per boot | 8,260 MB-boots |
