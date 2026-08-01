## In plain words

Two panes could get the same hidden ID after one pane closed, so the new pane could disappear behind the old one. Invar now gives every new pane its own ID, keeps old saved IDs, rejects duplicate ownership, and restarts a terminal read stream if it closes while the PTY is still open. Two panes can now share the name “Database 3”; closing one leaves the other alive.

## Result

READY at commit `552cf6c79181e0c129f930ec9bbc0a42f85b6b2e`.

The worktree is clean. The commit changes 38 files with 623 insertions and 184 deletions. I did not run the merge gate, merge a branch, push, or land the work.

The implementation follows the [filed task brief](brief-452-1-pane-identity-collides-by-name.md). It makes these changes:

- [PaneRuntimes.ts](../../../../src/modules/ui/PaneRuntimes.ts) now mints one opaque `pane-instance-N` ID from a monotonic application allocator. Labels keep their existing workspace-local numbering. Restored IDs are claimed before construction and cannot be claimed twice.
- [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) uses that allocator for terminal, agent, and extra database panes. Restore passes each saved ID back into the constructor. The runtime and narration maps reject duplicate ownership before insertion.
- [PanelHost.ts](../../../../src/modules/ui/PanelHost.ts), [TerminalPlugin.ts](../../../../src/modules/terminal/TerminalPlugin.ts), and [MediaPlugin.ts](../../../../src/modules/media/MediaPlugin.ts) reject a different pane or session that presents an occupied ID. Registration remains idempotent for the same object.
- [PanelHost.ts](../../../../src/modules/ui/PanelHost.ts) migrates old kind-based order entries such as `agent` and `terminal` to the new opaque IDs when those panes first register. Old settings keep their order.
- [AppStatusProjection.ts](../../../../src/modules/app/AppStatusProjection.ts) derives `panelContentIds`, `panelContentLabels`, and `panelContentKinds` from one live ordered-content array. It also publishes `panelActiveContentKind` and `panelCellKinds`, so harnesses do not treat a display kind as an instance ID.
- [OpenPty.ts](../../../../src/modules/terminal/OpenPty.ts) restarts a normally closed master read stream while the PTY remains open. `EIO`, an explicit PTY close, and fatal errors still stop the read path.
- [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts) restores an old `terminal` ID, creates two panes named `Database 3`, closes one through its visible hover control, and proves the other survives.

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

- The default baseline published `panelContentIds=["agent","terminal","database"]` while only the database was live. Its label and kind arrays contained one item. This reproduced the status-order mismatch folded in from #441 (align panel status arrays).
- A saved settings file restored the old `terminal` ID unchanged after the fix.
- The exact equal-name gesture passed at 120×40: two `Database 3` panes had two IDs, and one remained after the first row closed.
- The panel chrome smoke also passed at 88×24.
- The 10-line and 100,000-line shared fixtures produced the same shape. Each opened a terminal with `panelActiveContent="pane-instance-1"`, `panelActiveContentKind="terminal"`, and aligned ID, label, and kind arrays.
- Workspace-world, panel-split, agent, and settings smokes passed after their assertions changed from legacy IDs to live kinds.

## Positive controls

I planted the old behaviors before trusting the new checks. The focused run produced 5 failures:

- a restored ID could be claimed twice;
- `PanelHost` accepted a second object with the same ID;
- `TerminalPlugin` accepted a second session with the same ID;
- status IDs included the missing persisted entry while labels and kinds did not;
- a normally closed PTY read stream did not restart.

I removed the plants. The same focused run then passed 46 tests with 309 expectations. The equal-name panel gesture also failed when I restored the old database live-count ID and silent host collision, then passed again with the committed code.

## Contract reconciliation

- [Each panel instance owns one independent session](../../../../src/modules/ui/ui.invariants.md#each-panel-instance-owns-one-independent-session): strengthened. Equal labels no longer alias one ID. Host and runtime registries reject a second owner.
- [Panel content order is one persisted sequence](../../../../src/modules/ui/ui.invariants.md#panel-content-order-is-one-persisted-sequence): preserved. Old kind entries migrate in place, and restored pane IDs remain exact.
- [The panel contents list mirrors open content](../../../../src/modules/ui/ui.invariants.md#the-panel-contents-list-mirrors-open-content): preserved. The driven list shows both equal-name rows and removes only the clicked row.
- [A pane runtime owns its processes](../../../../src/modules/ui/ui.invariants.md#a-pane-runtime-owns-its-processes): strengthened. Runtime IDs are claimed before construction and cannot silently replace an owned session.
- [The terminal is a runtime plugin](../../../../src/modules/terminal/terminal.invariants.md#the-terminal-is-a-runtime-plugin): preserved. The duplicate-session guard stays inside the terminal runtime.
- [One openpty allocator serves both PTY roles](../../../../src/modules/terminal/terminal.invariants.md#one-openpty-allocator-serves-both-pty-roles): preserved. Read recovery lives in the shared `OpenPty` resource.
- [Shared PTY writes never block the event loop](../../../../src/modules/terminal/terminal.invariants.md#shared-pty-writes-never-block-the-event-loop): unchanged. The write queue and its timing did not change.
- [Observability never crashes the app](../../../../src/modules/system/system.invariants.md#observability-never-crashes-the-app): preserved. Status now reports live aligned arrays and separate kind fields.

No existing record says that pane IDs are independent from labels, names, and live counts. No terminal record says that a live PTY must retain a read path after its stream object closes. I propose these chosen records; I did not edit the contract files inside this task.

### Proposed record: Pane identity is independent of presentation

- Invariant: Every pane instance owns one immutable application ID. The ID does not derive from its name, label, kind, list position, workspace position, or number of live panes.
- Scope: panel panes, runtime registries, workspace persistence, status projection, and pane removal.
- Mechanism: one allocator mints and claims IDs before construction; restore reclaims the saved ID; every ID-keyed owner rejects a different object with an occupied ID.
- Impossible if true: two live panes alias one map entry because they have the same label; removing one removes another; restoring a pane changes its saved ID.
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

- `bun test`: PASS. 2,286 tests, 0 failures, 71,848 expectations, 348 files.
- `bun x tsc --noEmit`: PASS, including a post-commit run after formatting.
- `bun run check`: PASS. This is the repository’s conventions command. The requested `bun run check:conventions` alias does not exist in [package.json](../../../../package.json).
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs`: PASS. 1,329 annotations, 266 lattice links, 0 problems.
- `bash scripts/behavioral-contracts.sh`: PASS once. The only cadence messages were report-only warnings that met their declared floors.
- `bun scripts/harness/smoke-panel-chrome-harness.ts`: PASS at 120×40 and 88×24, including old-ID restore and the equal-name close gesture.
- `bun scripts/harness/smoke-workspace-tabs-harness.ts`: PASS.
- `bun scripts/harness/smoke-panel-split-harness.ts`: PASS.
- `bun scripts/harness/smoke-agent-harness.ts`: PASS.
- `bun scripts/harness/smoke-settings-applied-harness.ts`: PASS.

## Bycatch

None.
