## In plain words

Two panes could get the same hidden ID after one pane closed, so the new pane could disappear behind the old one. Invar now gives every pane its own ID, keeps old saved IDs, and uses the exact active pane when it needs geometry. Copying from a terminal works again, all 2,306 tests pass, and the cause of the original all-terminal incident stays open.

## Result

READY at commit `a94eb89fae1b1122ea7cf8ff55f3baa09f5888c9`. The round 1 implementation is commit `552cf6c79181e0c129f930ec9bbc0a42f85b6b2e`. The round 2 union is commit `e05b7b61f7e3e3f39f7139588333afe319329ef9`. The round 3 merge is commit `4222e760a9e63d06d58d043edb0e15540f0b30db` and includes `93e2488d088d3673487417a5ac9bda7d3b788ed1` from `fleet/442-panel-editor-tree-chrome-polish`. The round 4 consumer migration is commit `a94eb89fae1b1122ea7cf8ff55f3baa09f5888c9`.

The worktree is clean. I did not run the merge gate, push, or land the work. I committed with `SKIP_GATE=1`, as the [round 2 union brief](brief-452-2-union-444.md) and [round 4 consumer brief](brief-452-4-geometry-consumers.md) require.

The implementation follows the [round 1 task brief](brief-452-1-pane-identity-collides-by-name.md), the [round 2 union brief](brief-452-2-union-444.md), and the [round 4 consumer brief](brief-452-4-geometry-consumers.md). It makes these changes:

- [PaneRuntimes.ts](../../../../src/modules/ui/PaneRuntimes.ts) now mints one opaque `pane-instance-N` ID from a monotonic application allocator. Labels keep their existing workspace-local numbering. Restored IDs are claimed before construction and cannot be claimed twice.
- [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) uses that allocator for terminal, agent, and extra database panes. Restore passes each saved ID back into the constructor. The runtime and narration maps reject duplicate ownership before insertion.
- [PanelHost.ts](../../../../src/modules/ui/PanelHost.ts), [TerminalPlugin.ts](../../../../src/modules/terminal/TerminalPlugin.ts), and [MediaPlugin.ts](../../../../src/modules/media/MediaPlugin.ts) reject a different pane or session that presents an occupied ID. Registration remains idempotent for the same object.
- [PanelHost.ts](../../../../src/modules/ui/PanelHost.ts) migrates old kind-based order entries such as `agent` and `terminal` to the new opaque IDs when those panes first register. Old settings keep their order.
- [AppStatusProjection.ts](../../../../src/modules/app/AppStatusProjection.ts) derives `panelContentIds`, `panelContentLabels`, and `panelContentKinds` from one live ordered-content array. It also publishes `panelActiveContentKind` and `panelCellKinds`, so harnesses do not treat a display kind as an instance ID.
- [OpenPty.ts](../../../../src/modules/terminal/OpenPty.ts) restarts a normally closed master read stream while the PTY remains open. `EIO`, an explicit PTY close, and fatal errors still stop the read path.
- [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts) restores an old `terminal` ID, creates two panes named `Database 3`, closes one through its visible hover control, and proves the other survives.

## Round 2 union

The merge base was `5055cd44898ade30f9d008bb99195f2a358fe7ae`. I classified both conflict hunks against that base before resolving them.

- The first hunk was at the helper definitions near the top of [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts). This branch added `driveLegacyPersistedPaneRestore`. The history and chrome branch added `driveRightDockCrossing`. The union keeps both complete helpers.
- The second hunk was at the fixture calls near the bottom of the same file. This branch called the legacy restore fixture. The history and chrome branch called the right-dock crossing fixture. The union calls both before the shared size drives.

The database sequence merged without a textual conflict. It keeps this branch's two distinct `Database 3` IDs, close-one-survivor check, and the other branch's superscript count check.

No assertion from either branch was dropped. The union contains and passes all named chrome checks: splitter columns 37 and 91, editor-action colors, instance-toggle padding, and the superscript count. It also contains and passes all identity checks: restored `terminal` ID, distinct IDs for two panes named `Database 3`, and one surviving after the other closes.

The merge base measured 25 assertions and 46 waits. This branch measured 19 assertions and 50 waits before the union. The history and chrome branch measured 19 assertions and 55 waits. The resolved union measures 22 assertions and 56 waits. [project.coverage-deltas.md](../../../../project.coverage-deltas.md) declares those measured union numbers, and the coverage ratchet passes.

## Round 3 dirty-marker pickup

The second merge from `fleet/442-panel-editor-tree-chrome-polish` completed without conflicts. It changed only [HarnessSmokeSupport.ts](../../../../scripts/harness/HarnessSmokeSupport.ts) and [HarnessSmoke.test.ts](../../../../scripts/harness/HarnessSmoke.test.ts).

The dirty dot was not lost. The shared `activeTabHasDirtyMarker` test helper still read the old breadcrumb row after the editor-area rewrite moved breadcrumbs above the tabs. The merged helper locates the tab row from the published editor geometry and verifies the dirty marker there. Its focused unit coverage, the full dirty-marker smoke, and the editor smoke all pass.

I did not change the four unrelated red checks reported by panel, editor, and tree chrome polish (#442): the diff scrollbar thumb, agent-pane grid region, agent composer activation, and structure-filter focus tone.

## Round 4 identity-consumer migration

The stack failure was a stale harness lookup. [smoke-clipboard-frame-boundary-harness.ts](../../../../scripts/harness/smoke-clipboard-frame-boundary-harness.ts) passed the kind `terminal` to a helper that indexed `panelCellIds`. Opaque pane IDs made that lookup honest enough to fail. The smoke now gets the exact active cell before it selects terminal text.

I used the structural query tool and then inspected each match. These production consumers existed:

- [PanelHost.ts](../../../../src/modules/ui/PanelHost.ts) had singular `contentOfKind` and `visibleContentOfKind` seams. It now exposes plural `contentsOfKind` and `visibleContentsOfKind`. The old singular calls remain as explicit first-result compatibility methods.
- [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) selected current terminal, agent, and database content in several places. One policy now chooses the focused matching pane, then the first visible matching pane, then the first registered matching pane. Toggle commands use the visible part of that policy. The database factory explicitly chooses the first database provider that can create an instance.
- [AppStatusProjection.ts](../../../../src/modules/app/AppStatusProjection.ts) found terminal geometry by taking the first cell whose kind was `terminal`. It now receives the selected terminal pane and matches its exact ID. The aligned `panelCellIds` and `panelCellKinds` fields remain separate.
- Agent narration maps in [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) were already exact. Every get, set, and delete uses `agentPane.id`, and current narration starts with the selected agent pane. I made no narration change.
- The status projection was already honest about identity and presentation. `panelActiveContent` is an exact ID, `panelActiveContentKind` is a kind, and the ID and kind arrays are aligned. I preserved that split.

[HarnessSmokeSupport.ts](../../../../scripts/harness/HarnessSmokeSupport.ts) and [HarnessSmoke.ts](../../../../scripts/harness/HarnessSmoke.ts) now publish three shared lookup shapes: all cells of a kind, the exact active cell, and all content IDs of a kind. The cell helper also rejects misaligned ID, kind, and column arrays.

I migrated every stale or ambiguous harness consumer that the census found:

- [smoke-clipboard-frame-boundary-harness.ts](../../../../scripts/harness/smoke-clipboard-frame-boundary-harness.ts), [smoke-media-harness.ts](../../../../scripts/harness/smoke-media-harness.ts), [smoke-paste-harness.ts](../../../../scripts/harness/smoke-paste-harness.ts), and [smoke-terminal-stage-harness.ts](../../../../scripts/harness/smoke-terminal-stage-harness.ts) use the exact active cell for geometry.
- [smoke-agent-engine-switch-harness.ts](../../../../scripts/harness/smoke-agent-engine-switch-harness.ts), [smoke-agent-pane-ux-harness.ts](../../../../scripts/harness/smoke-agent-pane-ux-harness.ts), [smoke-agent-permissions-harness.ts](../../../../scripts/harness/smoke-agent-permissions-harness.ts), and [smoke-agent-search-harness.ts](../../../../scripts/harness/smoke-agent-search-harness.ts) use the exact active agent cell for footer geometry.
- [smoke-terminal-follow-harness.ts](../../../../scripts/harness/smoke-terminal-follow-harness.ts) uses the active exact cell for footer geometry. Its kind selection requires exactly one matching terminal and then follows that exact ID.
- [smoke-overlay-dialog-harness.ts](../../../../scripts/harness/smoke-overlay-dialog-harness.ts) compares `panelActiveContentKind` with `terminal` or `agent` instead of comparing the active ID with a kind.
- [smoke-plugin-manifest-harness.ts](../../../../scripts/harness/smoke-plugin-manifest-harness.ts) uses a plural kind lookup for terminal removal and the active kind for database focus.
- [smoke-database-harness.ts](../../../../scripts/harness/smoke-database-harness.ts) uses active and cell kinds for presentation checks. It maps database kinds to their aligned exact IDs when it checks active spaces.
- [smoke-tasks-harness.ts](../../../../scripts/harness/smoke-tasks-harness.ts) maps the database kind to its aligned exact IDs before excluding database spaces.
- [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts) finds a normal database cell through `panelCellKinds`.

I preserved intentional exact IDs. These include the old persisted `terminal` restore fixture, plugin-owned `database` and `media-demo` IDs, captured panel-split and terminal-follow targets, workspace-tab pane IDs, task-session IDs, and the aggregate `panel` heading ID. They name one known object. They do not turn a kind into an identity.

After the migration, no runtime or harness geometry consumer compares a pane kind with `panelCellIds` or `panelActiveContent`. The compatibility singular host methods have no production callers outside their explicit policy seam.

## Candidate verdicts

### Identity collision

The terminal-specific version was refuted. Before the change, a saved terminal restored as `terminal`, and adding another terminal produced `terminal-2`. Restore did ignore the saved ID and reminted it, but that exact drive did not collide.

The shared identity design still contained a confirmed collision. Extra database IDs used the number of live database panes. The sequence “create Database 2, create Database 3, close Database 2, create another database” minted `database-3` twice. The old [PanelHost.ts](../../../../src/modules/ui/PanelHost.ts) then returned silently and left the new instance outside the visible host. A planted return to the old live-count ID and silent host behavior made the new panel gesture fail. The committed code gives both `Database 3` panes different IDs.

This confirms a real cause for disappearing panes. It does not prove that the reported all-terminal incident came from this collision.

### PTY read lifecycle

The normal-close defect was confirmed in isolation. The old [OpenPty.ts](../../../../src/modules/terminal/OpenPty.ts) restarted after `EAGAIN`, but a normal read-stream `close` set `readStream` to null and never installed another reader. A live `bash` plus `cat` child then accepted writes while no bytes returned to Invar.

The new [OpenPty.test.ts](../../../../src/modules/terminal/OpenPty.test.ts) destroys only the duplicate master read stream, waits for the second read stream to start, writes `AFTER_RESTART`, and receives the bytes. With the restart removed as a positive control, this check timed out after 3,000 ms.

The exact idle event that closed the user’s streams is still unknown. A newly created terminal should have owned a fresh `OpenPty`, so this candidate also does not fully explain why every old and new terminal appeared blank at once. The original incident remains unproven.

## Driven evidence

- The default baseline published `panelContentIds=["agent","terminal","database"]` while only the database was live. Its label and kind arrays contained one item. This reproduced the status-order mismatch folded in from align panel status arrays (#441).
- A saved settings file restored the old `terminal` ID unchanged after the fix.
- The exact equal-name gesture passed at 120×40: two `Database 3` panes had two IDs, and one remained after the first row closed.
- The panel chrome smoke also passed at 88×24.
- The 10-line and 100,000-line shared fixtures produced the same shape. Each opened a terminal with `panelActiveContent="pane-instance-1"`, `panelActiveContentKind="terminal"`, and aligned ID, label, and kind arrays.
- Workspace-world, panel-split, agent, and settings smokes passed after their assertions changed from legacy IDs to live kinds.
- The merged chrome drive passed its editor-action colors, splitter columns 37 and 91, instance-toggle padding, and superscript count at 120×40. It also passed the compact 88×24 drive.
- The terminal-stage, paste, agent-engine, terminal-follow, agent-permission, and agent-search probes now locate panes by `panelCellKinds` and use the opaque ID only when matching heading geometry. The terminal-follow probe completed every scenario.

## Positive controls

I planted the old behaviors before trusting the new checks. The focused run produced 5 failures:

- a restored ID could be claimed twice;
- `PanelHost` accepted a second object with the same ID;
- `TerminalPlugin` accepted a second session with the same ID;
- status IDs included the missing persisted entry while labels and kinds did not;
- a normally closed PTY read stream did not restart.

I removed the plants. The same focused run then passed 46 tests with 309 expectations. The equal-name panel gesture also failed when I restored the old database live-count ID and silent host collision, then passed again with the committed code.

For round 4, I planted the stale first-terminal lookup in the new `activePanelCell` helper. Its focused test expected active `pane-instance-9`, cell index 1, and 40 columns. The plant returned `pane-instance-4`, cell index 0, and 30 columns. The run went red with 4 passes, 1 failure, and 7 expectations. I removed the plant. The focused helper, host, and status tests then passed 36 tests with 233 expectations.

## Contract reconciliation

- [Each panel instance owns one independent session](../../../../src/modules/ui/ui.invariants.md#each-panel-instance-owns-one-independent-session): strengthened. Equal labels no longer alias one ID. Host and runtime registries reject a second owner.
- [Panel content order is one persisted sequence](../../../../src/modules/ui/ui.invariants.md#panel-content-order-is-one-persisted-sequence): preserved. Old kind entries migrate in place, and restored pane IDs remain exact.
- [The panel contents list mirrors open content](../../../../src/modules/ui/ui.invariants.md#the-panel-contents-list-mirrors-open-content): preserved. The driven list shows both equal-name rows and removes only the clicked row.
- [A pane runtime owns its processes](../../../../src/modules/ui/ui.invariants.md#a-pane-runtime-owns-its-processes): strengthened. Runtime IDs are claimed before construction and cannot silently replace an owned session.
- [The terminal is a runtime plugin](../../../../src/modules/terminal/terminal.invariants.md#the-terminal-is-a-runtime-plugin): preserved. The duplicate-session guard stays inside the terminal runtime.
- [One openpty allocator serves both PTY roles](../../../../src/modules/terminal/terminal.invariants.md#one-openpty-allocator-serves-both-pty-roles): preserved. Read recovery lives in the shared `OpenPty` resource.
- [Shared PTY writes never block the event loop](../../../../src/modules/terminal/terminal.invariants.md#shared-pty-writes-never-block-the-event-loop): unchanged. The write queue and its timing did not change.
- [Observability never crashes the app](../../../../src/modules/system/system.invariants.md#observability-never-crashes-the-app): preserved. Status now reports live aligned arrays and separate kind fields.
- [The editor area owns one presented path row](../../../../src/modules/ui/ui.invariants.md#the-editor-area-owns-one-presented-path-row): preserved. Opaque panel identity does not own or reorder the editor path row.
- [Navigation chrome precedes file tabs](../../../../design.invariants.md#navigation-chrome-precedes-file-tabs), [Chrome strips take the panel tone](../../../../design.invariants.md#chrome-strips-take-the-panel-tone), and [Chrome edges keep one breathing cell](../../../../design.invariants.md#chrome-edges-keep-one-breathing-cell): preserved. The identity allocator changes registry keys and restore ownership. It does not alter chrome order, colors, padding, or geometry. The merged drive checks both sides together.

No existing record says that pane IDs are independent from labels, names, and live counts. No terminal record says that a live PTY must retain a read path after its stream object closes. I propose these chosen records; I did not edit the contract files inside this task.

### Proposed record: Pane identity is independent of presentation

- Invariant: Every pane instance owns one immutable application ID. The ID does not derive from its name, label, kind, list position, workspace position, or number of live panes.
- Scope: panel panes, runtime registries, workspace persistence, status projection, and pane removal.
- Mechanism: one allocator mints and claims IDs before construction; restore reclaims the saved ID; every ID-keyed owner rejects a different object with an occupied ID. Consumers use an exact ID when they need one pane and a plural kind lookup when they need a class of panes.
- Impossible if true: two live panes alias one map entry because they have the same label; removing one removes another; restoring a pane changes its saved ID; a consumer resolves one pane by its kind when several panes share that kind.
- Verification: allocator claim tests, host and plugin collision tests, old-settings restore, and the equal-name close gesture.
- Status: proposed on 2026-08-01.

### Proposed record: A live PTY retains one master read path

- Invariant: While an `OpenPty` is open and its master is readable, it owns one active or scheduled master read path.
- Scope: normal stream close, retryable read errors, fatal read errors, PTY close, and EOF.
- Mechanism: a normal close schedules replacement through the shared restart seam; explicit close, `EIO`, and fatal errors suppress restart.
- Impossible if true: the child remains alive and accepts input while Invar has neither a read stream nor a scheduled replacement.
- Verification: interrupt the duplicate read stream, observe a second read start, and receive bytes written after replacement.
- Status: proposed on 2026-08-01.

## Verification

- `bun test`: PASS in full after the round 4 commit. 2,306 tests, 0 failures, 71,916 expectations, 349 files.
- `bunx tsc --noEmit`: PASS.
- `bash scripts/conventions-gate.sh`: PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: PASS. 1,334 annotations, 266 lattice links, 0 problems.
- `bun scripts/check-coverage-ratchet.ts`: PASS. It inspected 392 files and found no undeclared decrease against `a9700d9`. The panel chrome declaration remains accurate at 22 assertions and 56 waits. Round 4 needs no coverage declaration.
- `bun scripts/harness/smoke-clipboard-frame-boundary-harness.ts`: ALL-PASS after the commit. Settings, active and idle agent copying, and active and idle terminal copying all pass. Each active or idle copy repeated 5 of 5 times.
- The round 4 database, paste, terminal-stage, agent-engine-switch, agent-permissions, agent-search, terminal-follow, overlay-dialog, media, tasks, and audio-narration drives pass their migrated identity lookups.
- The round 3 `bun scripts/harness/smoke-panel-chrome-harness.ts` run passed at 120×40 and 88×24. Both branches' named assertions were present and green. The round 4 run reached a separate contextual Database Add wait and failed the same way on unchanged commit `4222e760a9e63d06d58d043edb0e15540f0b30db`; see Bycatch.
- `bun scripts/harness/smoke-dirty-marker-harness.ts`: PASS. The clean, edit, backspace, rewrite, save, and saved-baseline marker checks are green.
- `bun scripts/harness/smoke-editor-harness.ts`: PASS. Its dirty flag and rendered dirty-dot checks are green.
- `bun scripts/harness/smoke-workspace-tabs-harness.ts`: PASS.
- `bun scripts/harness/smoke-panel-split-harness.ts`: PASS.
- `bun scripts/harness/smoke-terminal-harness.ts`, `smoke-terminal-backpressure-harness.ts`, and `smoke-terminal-stage-harness.ts`: PASS.
- `bun scripts/harness/smoke-paste-harness.ts`, `smoke-agent-engine-switch-harness.ts`, `smoke-terminal-follow-harness.ts`, `smoke-agent-permissions-harness.ts`, and `smoke-agent-search-harness.ts`: PASS.
- Focused `PaneRuntimes`, `PanelHost`, `TerminalPlugin`, `MediaPlugin`, `AppStatusProjection`, and `OpenPty` tests: PASS. 46 tests and 309 expectations.
- Focused round 4 `HarnessSmoke`, `PanelHost`, and `AppStatusProjection` tests: PASS. 36 tests and 233 expectations.

The merge surfaced no new evidence about why all old and new terminals in the original incident appeared blank together. The original incident remains unproven, and the open question about its shared cause stays open.

## Bycatch

The agent-pane UX smoke fails after the merged chrome changes at 110×50. The exact sequence is `bun scripts/harness/smoke-agent-pane-ux-harness.ts`, then the “composer word wrap, right gap, and idle teardown” section. The assertion reports `FAIL composer keeps composeralpha whole on one row`. It reproduced on a second full drive. All earlier identity-dependent focus, footer geometry, transcript, scroll, selection, and composer-edit checks passed. I did not change the word-wrap behavior because it is outside pane identity collides by name (#452).

The agent-cancel smoke fails before it types `/resolver-smoke ARGUMENTANCHOR`. Its whole-grid search clicks the first `❯` glyph, which is in editor history, instead of the composer glyph. The file has no pane ID or pane-kind lookup. This is agent composer activation (#455), not an identity failure. I did not change it.

The panel-chrome smoke times out at `120-column Database add offers only another Database instance before Database 3`. It reproduced twice on the round 4 tree and once in a detached worktree at unchanged round 3 commit `4222e760a9e63d06d58d043edb0e15540f0b30db`. That A/B result rules out the round 4 consumer migration. I removed the detached worktree and did not change this separate contextual-add behavior.

The plugin-manifest smoke passes the migrated terminal-uninstall identity section, then fails later at `the structure scrollbar publishes its settled dock-height geometry`. That assertion does not read pane identity. I did not change the separate structure scrollbar behavior.
