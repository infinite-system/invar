# READY report — terminal instance lifecycle and panel chrome

## In plain words

Closing one panel could quietly damage a different split, and the expand button could cover the
button that brought the panel back. I made each close change only its own pane, kept the restore
button reachable, and made the panel buttons and hover rows use one clear shape. The real app now
survives the full create, split, remove, expand, drag, restart, and neighbor protocol at 10 and
100,000 lines.

## Result

READY at commit `771eb51548dfa08f6ac41573bb97c3eaa62c2cb6` (`Fix panel lifecycle and
chrome`). The worktree has no tracked changes. The pre-existing untracked builder-fundamentals
setup file remains untouched.

The implementation covers all six original items and the later overlay-hover refinement in the
[task brief](brief-514-1-terminal-instance-lifecycle-and-panel-chrome.md).

## What was wrong and what changed

### Fresh-boot drive honesty

The app status file could publish `panelVisible=true` before the PTY emulator had applied the
completed synchronized-output frame that painted the panel. This was an instrument boundary, not a
panel-state race. A graph reply with `settled:false` also did not mean that the captured grid had
consumed the matching output.

[PtyTestDriver.ts](../../../../scripts/harness/PtyTestDriver.ts) now exposes a completed-frame
observation boundary. [DriveSession.ts](../../../../scripts/harness/DriveSession.ts) records that
boundary before every input and makes `waitForStatus` wait for status plus later completed terminal
output. After the change, Ctrl+J cannot report success while the old grid is still on screen.

### Over-removal and the unreachable split

The exact failing sequence left these registrations:

`ids=[4,6,7,8] groups=[[4],[6,8]] cells=[4]`.

Pane 7 was still registered, but no group contained it. The close path chose pane 4 as a temporary
fallback while the closing singleton group was still active. The next persistence pass then rewrote
the saved `[4,7]` group as `[4]`.

[PanelHost.ts](../../../../src/modules/ui/PanelHost.ts) now selects the fallback's persisted group,
loads that whole group, and aligns the active space, cell list, focus index, and focused identifier
before persistence. The repaired result is:

`ids=[4,6,7,8] groups=[[4,7],[6,8]] cells=[4,7]`.

The second launch restores the same groups and reaches every registered pane.

### Expanded-panel trap

The trapped graph was `panelExpanded=true`, with both `bottomPanelSplitter.top=0` and
`bottomPanelTabs.top=0`. The tab-row controls painted and received input over the Restore control.
The panel therefore had an expanded state but no clean pointer path back.

[PanelTabBar.ts](../../../../src/modules/ui/PanelTabBar.ts) now derives a right inset from the
splitter-control width while expanded. [RootView.ts](../../../../src/modules/ui/RootView.ts) uses
that projection for paint and input. Expand and Restore now remain symmetric through repeated
clicks, Ctrl+J, resize, split, create, and remove.

### One status control

[Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) registers one bottom-panel control through
the existing status-bar segment seam. It runs the same toggle as Ctrl+J and never creates a pane.
[StatusBar.ts](../../../../src/modules/ui/StatusBar.ts) projects only that generic contributed
control. [AgentPlugin.ts](../../../../src/modules/agent/AgentPlugin.ts) no longer registers the
separate `✦` control. Agents remain reachable through their chord and the panel Add control.

The implemented tooltip screenshot read:

```text
Toggle Bottom Panel (Ctrl+J)
```

I also planted the alternate wording and drove the same hover. Its screenshot read:

```text
Open Bottom Panel (Ctrl+J)
```

I restored the implemented toggle wording after the comparison. The status row now contains one
`❯` panel control and no `✦` control.

### Row chrome and tasks.json action

[PanelContentsList.ts](../../../../src/modules/ui/PanelContentsList.ts) now owns one
`rowControlOverlay` projection. It generates the truncation boundary plus the tasks.json, split, and
close cells. At rest, a row uses its full width and reserves no empty button cells. Hover keeps the
left edge fixed, changes only the right tail to `…` plus the controls, and unhover restores the exact
idle text. Idle actions inherit the row background. Only the hovered action uses the shared hover
background.

A live drive showed this exact transition, with an unchanged graph after each step:

```text
idle:  Terminal (Agent)
hover: Terminal (Ag… ◫  ×
idle:  Terminal (Agent)
```

The ` + Terminal` header now has one leading cell, panel background at rest, cursor-line background
on hover, and selection background while pressed. Its cancelled press leaves the graph unchanged.
The tasks.json glyph moved from the pane frame to the row's generated right overlay cluster.

## Adversarial protocol

[smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts) runs the
same protocol at 10 lines and 100,000 lines. It asserts ordered content identifiers, every persisted
group, and every visible cell after each input boundary.

| Step | Exact graph after the step |
|---|---|
| Open list | `ids=[] groups=[] cells=[]` |
| Create 1 | `ids=[1] groups=[[1]] cells=[1]` |
| Cancel pressed Add | unchanged `[1] [[1]] [1]` |
| Create 2, then 3 | `[1,2,3] [[1],[2],[3]] [3]` |
| Remove 1, remove 2, remove LAST | `[2,3]`, then `[3]`, then `[]`; groups and cells match each count |
| Click close while empty | `ids=[] groups=[] cells=[]`; the empty space remains |
| Recreate 4, 5, 6 | `[4,5,6] [[4],[5],[6]] [6]` |
| Remove middle 5 | `[4,6] [[4],[6]] [6]` |
| Split 4 with 7 | `[4,6,7] [[4,7],[6]] [4,7]` |
| Split 6 with 8 | `[4,6,7,8] [[4,7],[6,8]] [6,8]` |
| Create normal terminal 9 | `[4,6,7,8,9]`, plus group `[9]`, cells `[9]` |
| Create Invar agent 10 | `[10,4,6,7,8,9]`, plus group `[10]`, cells `[10]` |
| Create Claude terminal agent 11 | `[10,4,6,7,8,9,11]`, plus group `[11]`, cells `[11]` |
| Remove normal 9 | `[10,4,6,7,8,11]`; both earlier splits remain |
| Remove Invar 10 | `[4,6,7,8,11]`; both earlier splits remain |
| Remove Claude 11 | `[4,6,7,8] [[4,7],[6,8]] [4,7]` |
| Cancel another Add | unchanged `[4,6,7,8] [[4,7],[6,8]] [4,7]` |
| Expand, then Restore | graph unchanged; `panelExpanded` goes `false→true→false` |
| Expand, Ctrl+J close, Ctrl+J reopen | graph unchanged; reopen is visible and not expanded |
| Expand, resize to 100x32, Restore | graph unchanged; Restore remains hit-testable |
| Expand, create 12, remove 12, Restore | temporary group `[12]`; fallback returns to `[4,7]` |
| Two fast expand clicks | one complete cycle; graph unchanged and `panelExpanded=false` |
| Drag split divider, press row Close during capture | close is suppressed; full graph remains unchanged |
| Release divider, then close pane 4 | `[6,7,8] [[7],[6,8]] [7]` |
| Second launch from the first launch's settings | `[6,7,8] [[7],[6,8]] [7]`; panel and list visible |

There is no remove animation or asynchronous removal phase in this surface. That brief premise is
false: a remove commits synchronously before the next graph boundary. The protocol therefore checks
the exact post-remove graph before every create, attacks the actual pointer-capture interleave during
a split drag, and drives create/remove while expanded. It does not invent an animation state that
the app does not have.

## Positive controls

Every new contract was seen red before it was trusted:

- Decrementing the completed-frame count made the driver test fail because the second frame was
  still absent.
- Disabling the fallback-group selection made the PanelHost test lose pane 2 from its split.
- Setting the expanded tab inset to zero made the tab-bar test report `expected 6, received 0`.
- Removing the header's leading cell made the PTY smoke time out on the painted ` + Terminal` row.
- Removing the task action from the generated cluster made its geometry test return no tooltip.
- Changing the second-launch expected count from 3 to 4 failed with: `wanted 4, last settled value
  was 3`.
- Moving the overlay start one cell left made the unit test report a 19-cell row instead of 20 and a
  wrong ellipsis cell. The PTY smoke then timed out because Close no longer reached the last row
  cell.
- The original app supplied natural red controls for the one-button and expand checks: it painted
  both `✦` and `❯`, and its expanded tab controls covered Restore.

All plants were removed before the final commit.

## Design doctrine, chapter by chapter

- [Chapter 1 — Buttons](../../../../.claude/skills/ui-design/SKILL.md#1-buttons): one padded status
  toggle replaces two create buttons; Expand has a symmetric Restore; the row overlay has one stored
  paint, truncation, tooltip, and hit geometry; header idle, hover, press, and cancel states are
  distinct.
- [Chapter 2 — Dialogs](../../../../.claude/skills/ui-design/SKILL.md#2-dialogs): Add still uses the
  shared bounded-list popup. Database container close still uses the shared confirmation dialog. A
  cancel leaves the exact graph unchanged.
- [Chapter 3 — Flows](../../../../.claude/skills/ui-design/SKILL.md#3-flows-multi-step-interactions):
  every Add, cancel, split, close, expand, and reopen step has an explicit end state. Pointer capture
  suppresses a competing close until the split drag releases.
- [Chapter 4 — Text inputs](../../../../.claude/skills/ui-design/SKILL.md#4-text-inputs): this change
  adds no text-input dialect. The Add flow keeps the existing shared popup and its existing input
  ownership.
- [Chapter 5 — Scroll areas](../../../../.claude/skills/ui-design/SKILL.md#5-scroll-areas): no new
  scroll position or scrollbar was added. The neighboring terminal momentum, reversal, resize, and
  bottom-follow smoke remains green.
- [Chapter 6 — Copy](../../../../.claude/skills/ui-design/SKILL.md#6-copy-text-capability--universal):
  the chrome remains non-selectable and does not steal pane selection. The neighboring split and
  terminal smokes still select and copy through the shared OSC 52 route.

The result uses one UX dialect: panel and row controls use theme glyphs, three-cell padding, the
panel/selection/cursor-line background family, shared popup and confirmation hosts, and symmetric
toggle semantics. The neighbor sweep found no control that required a second local dialect.

## Invariants, record by record

The governing records are in
[ui.invariants.md](../../../../src/modules/ui/ui.invariants.md).

- **Panel content order is one persisted sequence:** upheld. Close no longer rewrites a surviving
  split from a temporary fallback. Both fixture scales restore the same order on a second launch.
- **An emptied space survives its last instance:** refined. The last close retains the active empty
  space and its Add affordance. A fallback now loads its persisted group before the save pass.
- **A persisted pane identity is never reissued:** upheld. IDs advance through 12 without reuse, and
  the second launch claims 6, 7, and 8 unchanged.
- **Every registered panel content is reachable:** repaired. Pane 7 can no longer remain registered
  outside every space group.
- **Panel controls share paint and hit geometry:** refined. Expanded inset, tasks.json relocation,
  and `rowControlOverlay` now make Restore, truncation, icons, tooltips, and hits derive from their
  owning projections.
- **The add control keeps one button appearance:** refined. The record now names the leading cell
  and the idle, hover, and pressed backgrounds.
- **Status text is assembled from ordered contributions:** refined. One generic bottom-panel control
  comes through the contribution seam; the host no longer names Terminal or Agent controls.

The [app invariant file](../../../../src/modules/app/app.invariants.md) has no status-bar contribution
record. The relevant record lives in the UI contract, so the brief's app-record pointer was a miss.
No app invariant needed a change.

The invariant checker resolved 1,386 annotations and 271 lattice links with 0 problems.

## Neighbor and blast-radius drive

The final-code neighbor drive asserted the full panel graph after each step:

- Shared `❯` click open, click close, Ctrl+J open, and Ctrl+J close all kept
  `ids=[] groups=[] cells=[]`.
- Settings open/close, shortcut help open/close, and right dock open/close changed only their own
  visibility fields.
- Plugin Add opened and cancelled with an empty graph. Database then opened as
  `ids=[1] groups=[[1]] cells=[1]`.
- Database container close opened the shared confirmation. No preserved the graph. A repeated close
  plus Yes removed it to `[] [] []`.
- Terminal, Agent, and split smokes now drive the one-button toggle plus visible Add or agent chord.
  They no longer encode the removed create-button behavior.
- The final artifact state had panel, expanded mode, Settings, help, and right dock all false, with
  no content, group, or cell IDs.
- `app.showLog(40)` and the later 30-line log sweep contained only boot and `settings-save` info
  entries. There were no warnings or errors.

## Instrument feedback

**EASY:** the warm server, live graph, exact status arrays, screen bands, per-cell colors, and shared
10/100,000-line fixtures made the lifecycle and overlay transitions fast to inspect. The second
launch reused the first launch's real saved settings file.

**CONFUSING:** a status publication and a PTY-emulator observation were separate boundaries, while
the old wait reported only the first. Also, `clickText('❯')` chose the editor history glyph before
the identical status glyph. A last-row screen rectangle was required to address the visible status
control honestly.

**MISSING:** Drive needs a role-aware or rectangle-scoped text click in its fluent front door for
duplicate glyphs. The raw snapshot already supports rectangles, but the common `clickText` verb
still means first match. The completed-frame wait added here closes the more serious missing
status-to-screen boundary.

## Verification

- `bunx tsc --noEmit` — PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — PASS, 0 problems.
- `bash scripts/conventions-gate.sh` — PASS. The core-vocabulary ratchet tightened from 33 to 30.
- Task-owned unit set — PASS: 82 tests, 336 expectations, 0 failures.
- `bun scripts/harness/smoke-panel-chrome-harness.ts` — ALL-PASS at 10 and 100,000 lines, including
  both required second launches.
- `bun scripts/harness/smoke-agent-harness.ts` — ALL-PASS.
- `bun scripts/harness/smoke-terminal-harness.ts` — ALL-PASS.
- `bun scripts/harness/smoke-panel-split-harness.ts` — ALL-PASS in Nerd Font and Unicode tiers.
- Full `bun test` — 2,418 pass and 2 unrelated failures in the untouched tasks-dashboard test file;
  see Bycatch. An earlier pre-refinement full run passed 2,419 tests with 0 failures. The isolated
  task-owned set and all affected PTY paths pass after the refinement.

## Bycatch

- **CONFIRMED twice:** the welcome screen says `Ctrl+P command palette`, while Ctrl+P opens Quick
  Open. Fresh app screenshots reproduced it. This is outside panel task scope and matches the
  conductor's filed sighting.
- **CONFIRMED twice:**
  [TasksDashboardPlugin.test.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPlugin.test.ts)
  is red with no diff in `src/modules/tasks-dashboard/`. It expects `tasksRows=3` but receives 2,
  then expects the detail-row pointer at `(45,3)` to return true but receives false. The full run and
  an isolated run reproduce both failures. This neighboring surface is under the live-tasks task,
  so I did not change it.
