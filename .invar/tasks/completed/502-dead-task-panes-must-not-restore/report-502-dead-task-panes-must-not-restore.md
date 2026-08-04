# READY report — dead task panes must not restore

## In plain words

The app rebuilt old task tabs as empty terminals after their tasks had died. It now drops those tabs, keeps real terminal tabs, and saves the cleaned layout. A second boot reads the clean file, so the dead tabs do not return.

## Result

Commit `e09c9aec` completes the task. The worktree is clean.

The liveness test is an existing pane with the exact stable task identity. Tasks use `task:<encoded workspace root>:<configuration index>`. If [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) finds that identity in the active panel world, restore reuses the live pane. If no pane owns it, the saved task entry is dead and restore drops it. A declared folder-open task then starts through `TaskLauncher`, which gives the terminal runtime its process declaration.

The fix also removes each dropped task identity from `panelContentOrder`. The saved workspace groups come from the restored live panes, so the first boot heals both persisted sequences.

## Driven evidence

I first used `bun run drive` with a scratch workspace and scratch home. Its saved Terminal space held `Claude` and `Terminal` task panes. The first frame painted both rows. Status reported both `task:<root>:0` and `task:<root>:1` in `panelContentIds`, `panelCellIds`, and `panelContentOrder`. It reported no launched tasks.

After the fix, the same scratch home reported no task panes and hid the empty panel. The permanent smoke uses a stronger mixed case. It saves one real `Terminal 5` pane beside the two dead task panes.

The [panel chrome smoke](../../../../scripts/harness/smoke-panel-chrome-harness.ts) drove that mixed case at 10 and 100,000 lines. On both scales, the first boot kept only `Terminal 5`. It removed both task identities from the workspace groups and global order. The second boot kept the same clean row.

The positive control restored the old placeholder construction. The new smoke failed on the 10-line case with `Timed out waiting for the first boot drops dead task panes from their saved Terminal space`. I removed the plant before the final pass.

## Changes

- [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) now reuses only an existing live task pane. It records and drops dead saved task identities. It saves the healed workspace state and global order.
- [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts) now covers two dead task panes beside `Terminal 5`. It checks the first boot, saved file, second boot, and both scale ends.
- [TaskLauncher.test.ts](../../../../src/modules/tasks/TaskLauncher.test.ts) now names the real reuse case as a live task identity.
- [tasks.invariants.md](../../../../src/modules/tasks/tasks.invariants.md) now distinguishes same-session live reuse from fresh-process restore.
- [ui.invariants.md](../../../../src/modules/ui/ui.invariants.md) now records that restore cannot create a process-free task placeholder.
- [project.invariants.md](../../../../project.invariants.md) and [conventions-gate.sh](../../../../scripts/conventions-gate.sh) tighten the core vocabulary baseline from 34 to 33.

## Invariants

- **Panel content order is one persisted sequence — strengthened.** Restore filters dead task identities from workspace groups and `panelContentOrder`. The smoke proves the visible row and both saved sequences agree across two boots.
- **A persisted pane identity is never reissued — upheld.** Bootstrap still reserves every loaded identity before plugin registration. The restore path checks for an existing pane before it drops a dead task entry. Removing the saved task entry does not release the reserved identity in the current app generation.
- **A pane runtime owns its processes — strengthened.** Bootstrap no longer asks the terminal runtime to create a task pane without a process declaration. Live panes stay with their runtime. Declared tasks still launch through `TaskLauncher` and the terminal runtime.
- **Folder open starts declared tasks — refined.** The old record said fresh panel restore could register the stable task identity. The corrected record limits reuse to an already-live pane in the same app session.
- **Core carries no plugin vocabulary — strengthened.** Removing the host-owned task placeholder reduced the measured core vocabulary population from 34 to 33. The ratchet and record now use 33.

No assigned record has an unresolved miss.

## Verification

- `bun run drive --open <scratch workspace> --home <scratch home> --geometry 120x40` — reproduced the two stale task panes before the fix and showed none after it.
- `bun scripts/harness/smoke-panel-chrome-harness.ts` — `ALL-PASS`, including 10-line and 100,000-line double boots.
- `bun scripts/harness/smoke-tasks-harness.ts` — `ALL-PASS`. Live configured tasks still launched in separate process-backed panes.
- `bunx tsc --noEmit` — exit 0.
- `bun test src/modules/ui/PanelWorkspaceState.test.ts src/modules/tasks/TaskLauncher.test.ts` — 16 passed, 0 failed, 42 expectations.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 1,387 annotations resolved, 266 lattice links resolved, 0 problems.
- `bash scripts/conventions-gate.sh` — pass with the vocabulary baseline at 33.
- `git show --check --oneline HEAD` — clean.

## Instrument feedback

EASY — `bun run drive` showed the stale pane row and the exact task identities in one command. The existing panel chrome smoke already had the correct saved-layout and double-boot fixture shape. No drive verb was missing.

## Bycatch

None observed.
