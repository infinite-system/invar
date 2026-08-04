# READY — restored task panes stay in their saved space

## In plain words

The app forgot that saved task panes belonged inside the Terminal space. It made extra Claude and Terminal space tabs instead. Restore now keeps each undeclared pane in its first saved space, removes stale copies, and saves the repaired layout.

## Result

READY at commit `5c236bf2` (`Keep restored task panes in saved spaces`) on branch `fleet/501-restored-task-panes-mint-extra-spaces`.

The change touches 5 files. It adds 207 lines and removes 5 lines. The worktree is clean.

## What changed

- [PanelWorkspaceState.ts](../../../../src/modules/ui/PanelWorkspaceState.ts) now treats a runtime declaration as strict placement data. An undeclared pane instead trusts its saved space.
- Restore claims each persisted pane identifier once. The first valid saved location wins, so later stale spaces cannot claim the same pane.
- [PanelHost.ts](../../../../src/modules/ui/PanelHost.ts) now exposes whether a pane kind has a declaration. It no longer turns an absent declaration into a self-named space during restore.
- [Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) saves the restored layout after the restore guard ends. The next boot reads the healed state.
- [PanelWorkspaceState.test.ts](../../../../src/modules/ui/PanelWorkspaceState.test.ts) covers an undeclared task kind in Terminal and a later stale copy.
- [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts) drives the saved task shape at 10 and 100,000 lines. Each scale boots the same home twice.

## Driven evidence

The first scratch home copied the real task-kind shape without writing `~/.config/invar/settings.json`. Before the fix, the screen painted `Claude ×  Terminal ×` as space tabs. The graph held two task-named spaces and no restored Terminal space.

After the fix, the graph held one `terminal` space. It contained both real-shape task identifiers. The saved file then contained only that Terminal space.

The final smoke used the shared 10-line and 100,000-line fixtures. At both scales, the first boot painted one Terminal space and no Claude space tab. The second boot kept the same result from the healed file.

The positive control restored the old fallback with one temporary line. The smoke failed with `Timed out waiting for the first boot folds the restored task pane into its saved Terminal space`. I removed the planted defect before the final pass.

## Invariant review

Scope came from the changed UI restore path and the records named in the [brief](brief-501-1-restored-task-panes-mint-extra-spaces.md).

- **Panel content order is one persisted sequence — strengthened.** Restore keeps the first valid persisted occurrence. The healed snapshot keeps that order for the next boot.
- **A persisted pane identity is never reissued — strengthened.** One restore pass can claim a saved pane identity only once. A stale duplicate space cannot reuse it.
- **An emptied space survives its last instance — upheld.** The change does not close a live emptied space. It omits only stale restored spaces whose duplicate panes were already claimed elsewhere.
- **Every registered panel content is reachable — upheld.** Every created task pane lands in the retained Terminal space. Restore creates no pane for a rejected duplicate.

No record miss, stress, violation, refinement, or contract edit was found. The invariant checker resolved 1,387 annotations and 266 lattice links with 0 problems.

## Verification

- `bunx tsc --noEmit` — exit 0.
- `bun test src/modules/ui/PanelWorkspaceState.test.ts src/modules/ui/PanelHost.test.ts` — 44 passed, 0 failed, 185 expectations.
- `bun scripts/harness/smoke-panel-chrome-harness.ts` — `ALL-PASS`. This includes same-home restart checks at 10 and 100,000 lines, plus 120×40 and 88×24 panel checks.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — 0 problems.
- `bash scripts/conventions-gate.sh` — `PASS`.

Per the [brief](brief-501-1-restored-task-panes-mint-extra-spaces.md), I did not run `scripts/merge-gate.sh` or `scripts/behavioral-contracts.sh`.

## Bycatch

None observed.

## Instrument feedback

CONFUSING — `showScreen([33, 34, 35])` accepted the call but printed no grid rows. `showScreen()` printed the full grid and unblocked the sighting. No drive verb was missing.

## Handoff

The branch is committed and ready for the conductor. Do not write the user's real settings during review. Use an isolated home as the smoke does.
