## In plain words

Invar made a Database pane before the user asked for one, then left it behind with no row to close. I changed Database to make panes only after an Add gesture, kept an emptied panel open with an Add Terminal message, and made each instance close at once while containers still ask. I then swept the checks that expected the old pane and dialog, so they now measure the new behavior.

## READY

Empty right pane has no add affordance (#459) is complete through code commit `90f10a2b7c6458a0b54229173c8931689111836c`. The worktree is clean.

I implemented the [round 1 brief](brief-459-1-empty-right-pane-has-no-add-affordance.md), [round 2 brief](brief-459-2-2-confirm-scales-with-blast-radius.md), [round 3 brief](brief-459-3-3-no-confirm-at-all.md), [round 4 brief](brief-459-4-4-sweep-the-consumers.md), and [round 5 brief](brief-459-5-tmp-brief-459-5.md).

## Cause and repair

The initial [probe](probe-459-empty-dock.ts) reproduced three registered contents before any close: two terminal instances and one content with the bare identifier `database`. Only the two terminals belonged to the restored space. The Database plugin created and registered a live pane during application boot, while restore replaced the visible panel spaces. The suggested `detachContent` promotion path was not the cause. The divergence existed before the first close gesture.

The repair separates a plugin factory from a live pane:

- [ApplicationContributions](../../../../src/modules/app/ApplicationContributions.ts) registers a contributed factory, not a shared live panel content.
- [PanelContentFactories](../../../../src/modules/ui/PanelContentFactories.ts) owns one factory per pane kind. The Database plugin creates an opaque `pane-instance-N` only after a user Add gesture or saved-pane restore.
- [PanelHost](../../../../src/modules/ui/PanelHost.ts) no longer has shared content copied into every workspace. Restore throws when any registered identifier has no space row. Closing the last instance removes every registry, cell, and row entry, but leaves the panel visible.
- [PanelContentsList](../../../../src/modules/ui/PanelContentsList.ts) paints `Add Terminal` only when its row set is empty. It keeps `+ Terminal` while any terminal remains.

The final probe reported two terminal identifiers and no Database identifier before close. After both row closes, `panelContentIds` and `panelCellIds` were empty, `panelVisible` and `panelListVisible` were true, and `Add Terminal` was present.

## Close behavior

One instance always closes without a dialog. This includes a terminal running `sleep 30`. There is no foreground-process exception, setting, pause, toast, undo, or recovery path.

A panel container still uses the generic dialog because that gesture closes every instance inside it. The driven two-instance case painted `Close Terminal and its 2 instances?` and `Close Database and its 2 instances?`. Enter selected the default No choice and kept both instances. Left then Enter selected Yes and removed the Database container and both of its instances.

The shared [HarnessSmoke](../../../../scripts/harness/HarnessSmoke.ts) gesture now travels to the painted container close mark before it clicks. Its instance-row helper first hovers the painted row, waits for its controls, and then travels to the close glyph it sees. This removes the stale coordinate guess from every caller.

## Scale and driven evidence

The existing [panel chrome smoke](../../../../scripts/harness/smoke-panel-chrome-harness.ts) passed at 120 by 40 and 88 by 24. Both sizes proved all of these states:

- A restored nonempty panel had two reachable terminals and no unrequested Database pane.
- A two-instance container asked with the exact count and defaulted to No.
- A live foreground terminal closed from its hovered instance-row mark with no dialog.
- `Add Terminal` stayed absent with one cell and painted after the last cell closed.
- The empty panel and its list stayed visible.

The same smoke also created Database through the real Add control, closed individual Database instances without dialogs, and confirmed the two-instance Database container close.

## Round 4 consumer sweep

The first structural census found 84 status-field reads in harness consumers: 37 `panelContentKinds`, 32 `panelContentIds`, and 15 `panelContentLabels`. It found seven stale reachability assumptions across four smokes, plus one old instance-confirmation block:

- [Settings applied](../../../../scripts/harness/smoke-settings-applied-harness.ts) had two orders that included an unrequested Database registration. The correct registered order is `agent,terminal`, then `terminal,agent` after Alt+Up. The visible cell remains `terminal`. Database is absent because no user opened it.
- [Workspace tabs](../../../../scripts/harness/smoke-workspace-tabs-harness.ts) required the second workspace to contain its declared task and Database. It now requires exactly the declared task before later gestures add terminal and agent panes.
- [Workspace layout isolation](../../../../scripts/harness/smoke-workspace-layout-isolation-harness.ts) treated two spaces as proof that Ctrl+Shift+A added an agent. The old Database space made that predicate true before the gesture. It now waits for the agent registration itself.
- [Plugin manifest](../../../../scripts/harness/smoke-plugin-manifest-harness.ts) had three literal `database` identifier checks. Live pane identifiers are opaque. The smoke now checks kind, proves reinstall creates no pane, and then opens Database through the real chord.
- [Panel split](../../../../scripts/harness/smoke-panel-split-harness.ts) waited for the removed instance dialog. Nerd and Unicode arms now prove direct instance removal with no painted dialog. Each arm reopens Terminal, closes its one-instance container, observes `Close Terminal and its 1 instance?`, and proves Enter defaults to No.

The final census has 91 field reads: 47 kinds, 29 identifiers, and 15 labels. The count grew because the corrected close and plugin lifecycle arms state their positive and negative sets. No stale literal Database identifier, phantom order, second-space proxy, or instance-confirmation expectation remains.

The sweep found one product lifecycle defect outside the six gate reds. Disabling a panel factory removed the factory but not panes that it had already created. [ApplicationContributions](../../../../src/modules/app/ApplicationContributions.ts) now removes every pane of the factory kind from every workspace panel world before it unregisters the factory. A two-world host test and a contribution disable test lock this behavior.

### A/B and six-smoke verdict

- Workspace tabs: plain main passed. The pre-repair branch failed at `the second workspace projects only its declared task pane`. The corrected branch passed.
- Tasks: plain main passed. The pre-repair branch failed to close `Displaced` through the changed helper. The corrected shared painted-row gesture passed.
- Workspace layout isolation: the gate and pre-repair branch failed because the removed phantom had silently satisfied its second-space wait. The corrected agent condition passed.
- Panel split: the gate failed on the removed terminal-instance dialog. The direct-close and container-count arms passed in both glyph tiers.
- Settings applied: the gate failed twice on `agent,terminal,database`. The reachable sets passed.
- Shortcut help: the gate failed while seeking Toggle Word Wrap. Plain main passed 10 of 10 direct serial runs, and the branch passed its required direct run. I did not reproduce the known serial tail lacks quiet retry (#457) failure outside the gate, so I made no shortcut-help change.

Earlier rounds ran the committed probe, the panel-chrome smoke, focused tests, full `bun test`, TypeScript, conventions, and the invariant checker. They did not run the six smokes named by round 4. Reporting the earlier work as if several smokes were green did not mean the full smoke set was green. That verification gap let stale consumers reach the conductor gate.

## Positive controls

- I disabled the empty header. [PanelContentsList.test.ts](../../../../src/modules/ui/PanelContentsList.test.ts) failed because it received `+ Terminal ▾` instead of `Add Terminal`. I restored the condition.
- I removed the restore reachability check. [PanelHost.test.ts](../../../../src/modules/ui/PanelHost.test.ts) failed because the unreachable `terminal` registration did not throw. I restored the check.
- I changed the container count from 2 to 3. The same host test failed with expected 2 and received 3. I restored the count.
- I made instance close leave the selected instance open. The PTY smoke failed at `Timed out waiting for Terminal One has 0 rows after one row close`. I restored direct removal, and the complete smoke passed.
- I removed the factory-disable pane sweep. [ApplicationContributions.test.ts](../../../../src/modules/app/ApplicationContributions.test.ts) failed because `pane-instance-1` remained registered and undisposed. I restored the sweep, and the lifecycle tests passed.

## Invariant result and proposals

- [The panel contents list mirrors open content](../../../../src/modules/ui/ui.invariants.md#the-panel-contents-list-mirrors-open-content) was violated before the repair. A registered Database content had no space, cell, or row. The factory seam removes that state, and restore now rejects it. I propose this refinement: when no window remains, a visible panel forces the list projection open and its header paints `Add <kind>`; when one or more windows remain, the saved pin decides list visibility; the Add message never paints while a row exists.
- [A pane runtime owns its processes](../../../../src/modules/ui/ui.invariants.md#a-pane-runtime-owns-its-processes) remains true. A terminal instance close removes that runtime-owned pane and its process with no application-level confirmation branch. A container close counts live pane identifiers, confirms once, and then removes each owned pane through the host.
- [Pane identity is separate from presentation](../../../../src/modules/ui/ui.invariants.md#pane-identity-is-separate-from-presentation) remains true. `database` is now only a factory kind. Every live Database pane receives an opaque instance identifier and a separate label.
- [One dialog component serves confirms and prompts](../../../../design.invariants.md#one-dialog-component-serves-confirms-and-prompts) is accepted in main with panel-container close in Scope and no modal interaction for instance close. The two glyph-tier drives uphold it.
- [Every registered panel content is reachable](../../../../src/modules/ui/ui.invariants.md#every-registered-panel-content-is-reachable) is accepted in main. Restore rejection, exact workspace sets, lazy factory construction, and factory-disable cleanup now uphold it across creation, restore, workspace selection, and withdrawal.

## Verification

- `bun test`: 2,316 passed, 0 failed, and 71,951 expectations across 350 files.
- `bunx tsc --noEmit`: passed.
- `bash scripts/conventions-gate.sh`: passed.
- Invariant checker with `--all --refs`: 1,345 annotations and 266 lattice links resolved, with 0 problems. The accepted reachability record now has a code annotation at the host seam.
- Coverage ratchet: its positive control counted 2 assertions and 2 waits, then it inspected 392 files and passed against base `a9700d9`. I re-measured every declaration from this panel work after the final edit: panel chrome is assertions 25 → 29 and waits 46 → 67; panel split is assertions 35 → 29 and waits 33 → 31; the removed quit-confirmation test remains assertions 11 → 0 and waits 3 → 0.
- `bun scripts/harness/smoke-panel-chrome-harness.ts`: `ALL-PASS` at 120 by 40 and 88 by 24.
- All six round 4 smokes passed in direct serial branch runs: workspace tabs, workspace layout isolation, panel split, tasks, settings applied, and shortcut help.
- The broader plugin-manifest smoke passed its Database disable, reinstall-without-pane, and explicit-open arms. Its first run stopped earlier on the Bycatch item below; its immediate rerun passed the complete smoke.
- `git diff --check`: passed before commit. The committed tree is clean.
- I did not run `scripts/merge-gate.sh`, as required. I committed with `SKIP_GATE=1`.

## Bycatch

- Contract comment drift: the accepted [reachability record](../../../../src/modules/ui/ui.invariants.md#every-registered-panel-content-is-reachable) cites `.invar/tasks/active/459-empty-right-pane-has-no-add-affordance/probe-459-empty-dock.ts`, but the task and probe are under `.invar/tasks/in-progress/459-empty-right-pane-has-no-add-affordance/`. Its Evidence also cites `PanelHost.test.ts` without the `src/modules/ui/` path used by the repository. I did not edit the accepted record in this consumer task.
- Published list geometry is wrong in one expanded-panel state. A diagnostic tasks drive published `panelListGeometry` as `left=-24, top=0, width=24`, while `+ Terminal` painted at screen column 108 and the `Displaced: Claude` row painted at screen row 30. The shared close gesture now follows painted cells, so it no longer consumes the wrong origin. I did not change the status geometry seam.
- Suspect structure-scrollbar settlement flake, seen once: the first plugin-manifest run timed out at `the structure scrollbar publishes its settled dock-height geometry` while the grid painted the Structure pane and its scrollbar. The immediate complete rerun passed, including the later Database lifecycle arms. I did not change Structure scrolling.
- Contract-map drift in the [round 5 brief](brief-459-5-tmp-brief-459-5.md): it says no record governs the declaration file, but [Coverage may fall but never silently](../../../../project.invariants.md#coverage-may-fall-but-never-silently) explicitly requires the newest [project.coverage-deltas.md](../../../../project.coverage-deltas.md) row to contain exact before and after counts. I did not change the accepted record.
