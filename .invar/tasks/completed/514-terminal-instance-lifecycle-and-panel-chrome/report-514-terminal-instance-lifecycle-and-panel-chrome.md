# READY report — terminal instance lifecycle and panel chrome

## In plain words

Closing one panel could quietly damage a different split, and the expand button could cover the
button that brought the panel back. I made each close change only its own pane, kept the restore
button reachable, and made the panel buttons and hover rows use one clear shape. After the merge,
Ctrl+J opened an empty panel instead of a terminal; I restored its terminal behavior without making
the status click create content, aligned the dialog drives with that distinction, and the full
protocol passes again at 10 and 100,000 lines.

## Result

READY at commit `568eb8635f184d0e48e4422e5fef167151a42db0` (`fix merged panel gate contracts`).
It includes the original task commit `771eb51548dfa08f6ac41573bb97c3eaa62c2cb6`, the Round 2 chord
repair, and the Round 3 merge-baseline and dialog-drive repair. The worktree has no tracked changes.
The pre-existing untracked builder-fundamentals setup file remains untouched.

The implementation covers all six original items and the later overlay-hover refinement in the
[task brief](brief-514-1-terminal-instance-lifecycle-and-panel-chrome.md).

## Round 2 merge-gate repair

The [Round 2 brief](brief-514-2-2.md) exposed one over-unified action. Round 1 had made the
contributed status control and `Ctrl+J` call the same generic `panelHost.toggle()` seam. That was
correct for a no-create status control, but wrong for the established terminal chord. Workspace
tabs, Database, and paste all use the chord to select or lazily create the interactive terminal.

The real drives failed at these exact boundaries before the repair:

- Workspace tabs timed out at `the first workspace terminal owns live scrollback`.
- Database timed out at `Terminal receives focus before opening Database: Reconnect`.
- Paste timed out at `the focused terminal keeps the dropped paths out of the editor`.
- Workspace layout reported `panelListExpanded=false` but painted a 20-column empty list in the new
  workspace. The graph proved this was not leaked pinned state. The generic chord had opened an
  empty panel, whose empty-state list is meant to remain visible.
- The coverage ratchet found the two stale declarations named in the Round 2 brief: Agent waits were
  `8 → 6`, and panel-split waits were `33 → 40`.

[Bootstrap.ts](../../../../src/modules/app/Bootstrap.ts) now keeps two honest generators. The status
control toggles generic panel visibility and never creates content. `Ctrl+J` hides a visible panel
that already shows a terminal; otherwise it selects a registered terminal or creates one lazily and
focuses it. Hiding the whole host, instead of removing one cell through `toggleContent`, preserves an
expanded split unchanged. [smoke-terminal-harness.ts](../../../../scripts/harness/smoke-terminal-harness.ts)
now states both sides. [smoke-panel-chrome-harness.ts](../../../../scripts/harness/smoke-panel-chrome-harness.ts)
uses the visible status control for its intentionally empty lifecycle entrance, then retains the
`Ctrl+J` expanded-split interleave later in the protocol.

The scrollbar contention failure from the gate did not reproduce. Three isolated branch runs
completed at both 500 and 100,000 lines, and the last run used the final code. I did not widen a
timeout or weaken a scrollbar condition.

## Round 3 merge-gate repair

The [Round 3 brief](brief-514-3-3.md) named one count mismatch and two dialog-adjacent timeouts.

- The core-vocabulary census reports 32 sites on the merged branch. Main added three sites after the
  old 30-site baseline, while this task still removes one net site. The gate baseline is now 32, not
  33, with the merge arithmetic stated beside it.
- The post-Settings press already reached the generic `❯` control. Its smoke watched
  `terminalVisible`, which is intentionally unchanged because that control does not create a
  terminal. The observer now includes `panelVisible`, the state the control owns. The first press
  changes it and the restoring press changes it back.
- The same overlay smoke still used `❯` to create a terminal and still searched for the retired `✦`
  Agent button. Those neighbor cases now use the real `Ctrl+J` and `Ctrl+Shift+A` chords. Terminal
  and Agent focus, cursor hiding, Escape dismissal, and backdrop dismissal remain asserted.
- The 10-line Add-header cancel path did not reproduce its contention-tier timeout. It passed solo,
  passed in two concurrent full-smoke processes, and passed again in the final isolated command. I
  changed no panel behavior, wait, timeout, or Add assertion for this item.

The original overlay observer was a natural positive control: it failed twice at
`the first post-dismissal press reaches the underlying status action`. Adding the owned
`panelVisible` field made that exact first-press drive pass. The vocabulary gate likewise failed at
`32 site(s), baseline 30` before the arithmetic correction and passed afterward.

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
the existing status-bar segment seam. Its generic toggle never creates a pane.
[StatusBar.ts](../../../../src/modules/ui/StatusBar.ts) projects only that contributed control.
[AgentPlugin.ts](../../../../src/modules/agent/AgentPlugin.ts) no longer registers the separate `✦`
control. `Ctrl+J` keeps its terminal-specific select/create behavior, while Agents remain reachable
through their chord and the panel Add control.

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
- Replacing the lifecycle entrance's visible `❯` with absent `❮` made the final grid wait fail and
  print the complete 120-by-40 frame. I restored `❯` before the final run.
- The original app supplied natural red controls for the one-button and expand checks: it painted
  both `✦` and `❯`, and its expanded tab controls covered Restore.
- The Round 2 branch itself supplied four more natural red controls. Workspace tabs, Database,
  paste, and the saved-state lifecycle protocol all failed at their terminal boundary before the
  chord repair and passed after it. No new timeout was added.

All plants were removed before the final commit.

## Design doctrine, chapter by chapter

- [Chapter 1 — Buttons](../../../../.claude/skills/ui-design/SKILL.md#1-buttons): one padded generic
  status toggle replaces two create buttons; Expand has a symmetric Restore; the row overlay has one
  stored paint, truncation, tooltip, and hit geometry; header idle, hover, press, and cancel states
  are distinct.
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
panel/selection/cursor-line background family, and shared popup and confirmation hosts. The generic
status control and terminal chord no longer pretend to share a generator: the button owns panel
visibility, while the chord owns terminal reachability. Their common visible-panel action still
hides the whole host without changing its split graph.

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

The final invariant checker resolved 1,388 annotations and 287 lattice links with 0 problems.

## Neighbor and blast-radius drive

The final-code neighbor drive asserted the full panel graph after each step:

- Shared `❯` click open and click close kept `ids=[] groups=[] cells=[]`. Ctrl+J from that empty
  state created and focused `pane-instance-1`; its second press hid the panel while retaining
  `ids=[pane-instance-1] groups=[[pane-instance-1]] cells=[pane-instance-1]`.
- Settings open/close, shortcut help open/close, and right dock open/close changed only their own
  visibility fields.
- Plugin Add opened and cancelled with an empty graph. Database then opened as
  `ids=[1] groups=[[1]] cells=[1]`.
- Database container close opened the shared confirmation. No preserved the graph. A repeated close
  plus Yes removed it to `[] [] []`.
- Terminal, Agent, and split smokes now drive the one-button toggle plus visible Add or agent chord.
  They no longer encode the removed create-button behavior.
- The Round 2 fluent neighbor probe observed the graph after each chord: open was
  `visible=true, kind=terminal, ids=[pane-instance-1], cells=[pane-instance-1]`; close retained the
  same identifiers with `visible=false`.
- The final `app.showLog(40)` sweep contained only boot, app-start, boot-complete, and
  `settings-save` info entries. There were no warnings or errors.

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

Round 3 final-code gate targets:

- `bash scripts/conventions-gate.sh` — PASS. The census reports 32 vocabulary sites against the
  merged baseline of 32.
- `bun scripts/harness/smoke-overlay-dialog-harness.ts` — ALL-PASS. The first post-dismissal press,
  terminal and Agent focus neighbors, cursor visibility, and all outside/interior dialog actions
  pass.
- `bun scripts/harness/smoke-panel-chrome-harness.ts` — ALL-PASS. The 10-line Add press cancels
  cleanly, and both 10-line and 100,000-line second launches restore their exact graphs.
- `bun scripts/check-coverage-ratchet.ts` — PASS, 392 files and no undeclared decrease.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — PASS, 1,388
  annotations, 287 lattice links, and 0 problems.

Round 2 final-code gate targets:

- `bun scripts/harness/smoke-workspace-tabs-harness.ts` — ALL-PASS.
- `bun scripts/harness/smoke-workspace-layout-isolation-harness.ts` — ALL-PASS. Workspace B painted
  an unpinned list width of 0, and A restored its pinned width of 27 and exact two-pane group.
- `bun scripts/harness/smoke-database-harness.ts` — ALL-PASS.
- `bun scripts/harness/smoke-paste-harness.ts` — ALL-PASS.
- `bun scripts/harness/smoke-scrollbars-harness.ts` — ALL-PASS at 500 and 100,000 lines.
- `bun scripts/check-coverage-ratchet.ts` — PASS, 392 files and no undeclared decrease.
- `bun scripts/harness/smoke-terminal-harness.ts` — ALL-PASS. Status click stays no-create;
  `Ctrl+J` creates, focuses, hides, and retains the terminal.
- `bun scripts/harness/smoke-panel-split-harness.ts` — ALL-PASS.
- `bun scripts/harness/smoke-panel-chrome-harness.ts` — ALL-PASS at 10 and 100,000 lines, including
  both second launches and the expanded-split `Ctrl+J` cycle.
- `bun run typecheck` — PASS.
- `node .claude/skills/invariants/scripts/check_invariants.mjs --all --refs` — PASS, 0 problems.

Original task verification:

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

- **CONFIRMED twice:** `scripts/smoke-plugin-manifest.sh` still waits for the removed `✦` Agent
  status control after proving the Terminal runtime can be disabled while Invar Agent remains
  usable. The saved Round 3 gate frame and a local rerun both paint the intended single `❯` control
  and then time out at `the ✦ status control paints`. This is a stale neighboring smoke expectation,
  not a product regression, so I did not change it in this repair.

- **CONFIRMED twice:** the welcome screen says `Ctrl+P command palette`, while Ctrl+P opens Quick
  Open. Fresh app screenshots reproduced it. This is outside panel task scope and matches the
  conductor's filed sighting.
- **CONFIRMED twice:**
  [TasksDashboardPlugin.test.ts](../../../../src/modules/tasks-dashboard/TasksDashboardPlugin.test.ts)
  is red with no diff in `src/modules/tasks-dashboard/`. It expects `tasksRows=3` but receives 2,
  then expects the detail-row pointer at `(45,3)` to return true but receives false. The full run and
  an isolated run reproduce both failures. This neighboring surface is under the live-tasks task,
  so I did not change it.
